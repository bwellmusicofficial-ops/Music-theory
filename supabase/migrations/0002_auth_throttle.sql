-- =============================================================================
-- 0002_auth_throttle.sql : sign-in rate limiting that works on serverless (P1-02)
--
-- docs/accounts-and-data.md, "Sign-in mechanics": the sign-in, recovery and
-- sign-up routes are rate limited per IP address and per code name: 5 failed
-- attempts, then an increasing delay. Serverless instances share no memory, so
-- the counters live here.
--
-- One table (`auth_throttle`, service role only) and three functions the server
-- routes call with the secret key:
--   auth_throttle_check(key)             seconds to wait before this key may try again (0 = go ahead)
--   auth_throttle_fail(key, threshold)   count one failure; returns the seconds to wait (0 while under the threshold)
--   auth_throttle_clear(key)             forget a key (after a successful sign-in)
--
-- Schedule: below `threshold` failures no wait; then 30, 60, 120, 240, 480, 900
-- seconds (capped at 15 minutes). A key with no failure for an hour starts again
-- from zero. Keys are made by the server (a hash of the IP address, or the
-- normalised code name); no address is stored. Rows idle for a day are deleted.
--
-- Safe to run twice (CREATE ... IF NOT EXISTS, CREATE OR REPLACE, grants
-- re-stated). Run it in the SQL Editor after 0001_init.sql. Same rule as 0001:
-- run as `postgres` (BYPASSRLS), because the functions are SECURITY DEFINER.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception '0002_auth_throttle must run as a role with BYPASSRLS or SUPERUSER (postgres in Supabase)';
  end if;
  if pg_catalog.to_regnamespace('private') is null then
    raise exception 'Run 0001_init.sql first (schema "private" is missing)';
  end if;
end
$$;

create table if not exists public.auth_throttle (
  key             text primary key,
  failures        integer not null default 0,
  last_failed_at  timestamptz,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now(),
  constraint auth_throttle_key_len check (char_length(key) between 1 and 100),
  constraint auth_throttle_failures_nonneg check (failures >= 0)
);
create index if not exists auth_throttle_updated_at_idx on public.auth_throttle (updated_at);

-- Service role only, as account_secrets: RLS on and forced, no policy at all.
alter table public.auth_throttle enable row level security;
alter table public.auth_throttle force row level security;
revoke all on table public.auth_throttle from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_throttle to service_role;

-- Seconds to wait after the n-th failure.
create or replace function private.auth_throttle_delay(n integer, threshold integer) returns integer
  language sql immutable set search_path = ''
  as $$
    select case
      when n < threshold then 0
      else least(900, 30 * (2 ^ least(n - threshold, 5))::integer)
    end
  $$;

create or replace function public.auth_throttle_check(p_key text) returns integer
  language sql stable security definer set search_path = ''
  as $$
    select coalesce(
      (select greatest(0, ceil(extract(epoch from (t.locked_until - pg_catalog.now()))))::integer
       from public.auth_throttle t where t.key = p_key),
      0)
  $$;

create or replace function public.auth_throttle_fail(p_key text, p_threshold integer default 5) returns integer
  language plpgsql volatile security definer set search_path = ''
  as $$
declare
  n integer;
  wait integer;
begin
  if p_key is null or pg_catalog.char_length(p_key) not between 1 and 100 then
    raise exception 'auth_throttle_fail: bad key' using errcode = '22023';
  end if;
  if p_threshold is null or p_threshold < 1 then
    raise exception 'auth_throttle_fail: bad threshold' using errcode = '22023';
  end if;

  -- Housekeeping: idle keys are forgotten after a day.
  delete from public.auth_throttle where updated_at < pg_catalog.now() - interval '1 day';

  -- One atomic statement, so concurrent failures on different instances all count.
  insert into public.auth_throttle as t (key, failures, last_failed_at, updated_at)
  values (p_key, 1, pg_catalog.now(), pg_catalog.now())
  on conflict (key) do update set
    failures = case when t.last_failed_at < pg_catalog.now() - interval '1 hour' then 1 else t.failures + 1 end,
    last_failed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  returning t.failures into n;

  wait := private.auth_throttle_delay(n, p_threshold);
  update public.auth_throttle
     set locked_until = case when wait > 0 then pg_catalog.now() + wait * interval '1 second' else null end
   where key = p_key;
  return wait;
end
$$;

create or replace function public.auth_throttle_clear(p_key text) returns void
  language sql volatile security definer set search_path = ''
  as $$ delete from public.auth_throttle where key = p_key $$;

-- Nothing for anon, authenticated or the public role: only the server's secret key.
revoke all on function private.auth_throttle_delay(integer, integer) from public, anon, authenticated;
revoke all on function public.auth_throttle_check(text) from public, anon, authenticated, service_role;
revoke all on function public.auth_throttle_fail(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.auth_throttle_clear(text) from public, anon, authenticated, service_role;
grant execute on function public.auth_throttle_check(text) to service_role;
grant execute on function public.auth_throttle_fail(text, integer) to service_role;
grant execute on function public.auth_throttle_clear(text) to service_role;
