-- =============================================================================
-- 0005_security_hardening.sql : fixes from the P1-17 security review
--
-- Run it in the SQL Editor after 0001 to 0004, as `postgres`. Safe to run twice
-- (CREATE ... IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS, grants
-- re-stated). Additive: no existing table, column or function changes shape.
--
-- Until this is applied the server refuses sign-in, recovery and progress saving
-- (it logs "migration 0005 has not been applied") rather than running without these limits.
--
-- 1. auth_throttle_hit(key, threshold)   ATOMIC "count this attempt and tell me the wait" for
--      sign-in and recovery, called BEFORE the password or code is tried, so parallel guesses
--      cannot all slip past a check-then-record gap. Fixed one-hour window per key (a slow
--      trickle never accumulates). The first `threshold` attempts are tried; the threshold-th sets
--      a wait of 30 s for the next, then 60, 120 ... 900. Attempts during a wait are refused and not
--      counted. Returns 0 (go ahead) or the seconds to wait. Secret key only.
-- 2. revoke_user_sessions(user)          deletes every session and refresh token of one user
--      (auth.sessions, auth.refresh_tokens). Recovery calls it so whoever held the old password
--      is signed out. Secret key only.
-- 3. auth_user_id_by_synthetic_email()   lets sign-up clean up a half-made user. Secret key only.
-- 4. Volume caps (triggers, like 0001's attempts_rate_cap) so a learner's own token cannot be
--    used to fill the database:
--      lesson_progress  at most 1000 rows per user, 1500 writes per hour
--      game_scores      best 10 rows kept per game id, 1000 rows per user, 200 inserts per hour
--      mock_results     500 rows per user, 30 inserts per hour
--      attempts         5000 direct inserts per hour, 30000 rows per day (merge included)
--    Over a cap: error 53400 (rate) or 54000 (row limit). The server maps 53400 to "try later".
--    Numbers are in the private.cap_* functions below: change them in a new migration.
-- 5. The merge payload cap goes from 3 MiB to 2 MiB.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception '0005_security_hardening must run as a role with BYPASSRLS or SUPERUSER (postgres in Supabase)';
  end if;
  if pg_catalog.to_regnamespace('private') is null then
    raise exception 'Run 0001_init.sql first (schema "private" is missing)';
  end if;
  if pg_catalog.to_regclass('public.auth_throttle') is null then
    raise exception 'Run 0002_auth_throttle.sql first (table auth_throttle is missing)';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 1. Atomic throttle hit
-- -----------------------------------------------------------------------------
alter table public.auth_throttle add column if not exists window_started_at timestamptz;

create or replace function public.auth_throttle_hit(p_key text, p_threshold integer default 5) returns integer
  language plpgsql volatile security definer set search_path = ''
  as $$
declare
  f integer;
  lu timestamptz;
  ws timestamptz;
  next_wait integer;
begin
  if p_key is null or pg_catalog.char_length(p_key) not between 1 and 100 then
    raise exception 'auth_throttle_hit: bad key' using errcode = '22023';
  end if;
  if p_threshold is null or p_threshold < 1 then
    raise exception 'auth_throttle_hit: bad threshold' using errcode = '22023';
  end if;

  delete from public.auth_throttle where updated_at < pg_catalog.now() - interval '1 day';

  -- Make sure the row exists, then take its row lock: concurrent hits on one key queue up here and each sees the
  -- count the one before it left, so no two callers can both be "attempt number 5".
  insert into public.auth_throttle (key, failures, last_failed_at, window_started_at, updated_at)
  values (p_key, 0, pg_catalog.now(), pg_catalog.now(), pg_catalog.now())
  on conflict (key) do nothing;

  select t.failures, t.locked_until, coalesce(t.window_started_at, t.last_failed_at, t.updated_at)
    into f, lu, ws
    from public.auth_throttle t where t.key = p_key for update;

  -- A wait is running: refuse, and do not count (so refused attempts cannot lengthen their own wait).
  if lu is not null and lu > pg_catalog.now() then
    return ceil(extract(epoch from (lu - pg_catalog.now())))::integer;
  end if;

  -- Fixed window: an hour after it began, count again from zero.
  if ws < pg_catalog.now() - interval '1 hour' then
    f := 0;
    ws := pg_catalog.now();
  end if;

  -- This attempt goes ahead. Count it; from the threshold-th attempt on, the NEXT attempt must wait
  -- 30, 60, 120 ... 900 seconds (the same schedule as auth_throttle_fail).
  f := f + 1;
  next_wait := private.auth_throttle_delay(f, p_threshold);
  update public.auth_throttle t
     set failures = f,
         window_started_at = ws,
         last_failed_at = pg_catalog.now(),
         updated_at = pg_catalog.now(),
         locked_until = case when next_wait > 0 then pg_catalog.now() + next_wait * interval '1 second' else null end
   where t.key = p_key;
  return 0;
end
$$;

revoke all on function public.auth_throttle_hit(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.auth_throttle_hit(text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Revoke every session of one user
-- -----------------------------------------------------------------------------
-- Supabase keeps sessions in auth.sessions and their refresh tokens in auth.refresh_tokens
-- (user_id is text there). Deleting both ends the session at once: the auth server checks
-- that the session exists whenever a token is verified (the app calls getUser on every request).
create or replace function public.revoke_user_sessions(p_user uuid) returns integer
  language plpgsql volatile security definer set search_path = ''
  as $$
declare
  n integer;
begin
  if p_user is null then
    raise exception 'revoke_user_sessions: bad user' using errcode = '22023';
  end if;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Find a half-made sign-up user by its made-up address (only ever our own addresses)
-- -----------------------------------------------------------------------------
create or replace function public.auth_user_id_by_synthetic_email(p_email text) returns uuid
  language sql stable security definer set search_path = ''
  as $$
    select u.id from auth.users u
    where p_email like '%@accounts.invalid' and u.email = p_email
  $$;

revoke all on function public.auth_user_id_by_synthetic_email(text) from public, anon, authenticated, service_role;
grant execute on function public.auth_user_id_by_synthetic_email(text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Volume caps
-- -----------------------------------------------------------------------------
create or replace function private.cap_lesson_rows() returns integer language sql immutable set search_path = '' as $$ select 1000 $$;
create or replace function private.cap_lesson_writes_per_hour() returns integer language sql immutable set search_path = '' as $$ select 1500 $$;
create or replace function private.cap_game_rows() returns integer language sql immutable set search_path = '' as $$ select 1000 $$;
create or replace function private.cap_game_rows_per_id() returns integer language sql immutable set search_path = '' as $$ select 10 $$;
create or replace function private.cap_game_inserts_per_hour() returns integer language sql immutable set search_path = '' as $$ select 200 $$;
create or replace function private.cap_mock_rows() returns integer language sql immutable set search_path = '' as $$ select 500 $$;
create or replace function private.cap_mock_inserts_per_hour() returns integer language sql immutable set search_path = '' as $$ select 30 $$;
create or replace function private.cap_attempts_per_hour() returns integer language sql immutable set search_path = '' as $$ select 5000 $$;
create or replace function private.cap_attempts_per_day() returns integer language sql immutable set search_path = '' as $$ select 30000 $$;

revoke all on function private.cap_lesson_rows() from public, anon, authenticated;
revoke all on function private.cap_lesson_writes_per_hour() from public, anon, authenticated;
revoke all on function private.cap_game_rows() from public, anon, authenticated;
revoke all on function private.cap_game_rows_per_id() from public, anon, authenticated;
revoke all on function private.cap_game_inserts_per_hour() from public, anon, authenticated;
revoke all on function private.cap_mock_rows() from public, anon, authenticated;
revoke all on function private.cap_mock_inserts_per_hour() from public, anon, authenticated;
revoke all on function private.cap_attempts_per_hour() from public, anon, authenticated;
revoke all on function private.cap_attempts_per_day() from public, anon, authenticated;

-- Operational counters (no learner content). Not readable through the API: nothing is granted,
-- RLS is on with no policy, and they go when the user is deleted.
create table if not exists private.user_write_counters (
  user_id           uuid not null references auth.users (id) on delete cascade,
  kind              text not null,
  window_started_at timestamptz not null default now(),
  n                 integer not null default 0,
  primary key (user_id, kind)
);
alter table private.user_write_counters enable row level security;
alter table private.user_write_counters force row level security;
revoke all on table private.user_write_counters from public, anon, authenticated, service_role;

-- Counts `add` writes for (user, kind) in a fixed window of `win`, and refuses when the count passes `lim`.
-- The refused statement rolls back, so a refused write does not count.
create or replace function private.bump_write_counter(uid uuid, k text, lim integer, win interval, add integer default 1)
  returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
declare
  c integer;
begin
  insert into private.user_write_counters as w (user_id, kind, window_started_at, n)
  values (uid, k, pg_catalog.now(), add)
  on conflict (user_id, kind) do update set
    n = case when w.window_started_at < pg_catalog.now() - win then add else w.n + add end,
    window_started_at = case when w.window_started_at < pg_catalog.now() - win then pg_catalog.now() else w.window_started_at end
  returning w.n into c;
  if c > lim then
    raise exception 'write_rate_limited' using errcode = '53400',
      hint = 'Too many ' || k || ' writes in this period';
  end if;
end
$$;
revoke all on function private.bump_write_counter(uuid, text, integer, interval, integer) from public, anon, authenticated;

-- Serialises a user's row counts so the row cap cannot be raced.
create or replace function private.lock_user_rows(uid uuid) returns void
  language sql volatile security definer set search_path = ''
  as $$ select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 43)) $$;
revoke all on function private.lock_user_rows(uuid) from public, anon, authenticated;

-- lesson_progress: row cap (a new lesson only) and a write cap (inserts and updates).
create or replace function private.lesson_progress_insert_caps() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  perform private.lock_user_rows(new.user_id);
  if not exists (select 1 from public.lesson_progress p where p.user_id = new.user_id and p.lesson_id = new.lesson_id)
     and (select pg_catalog.count(*) from public.lesson_progress p where p.user_id = new.user_id) >= private.cap_lesson_rows() then
    raise exception 'lesson_progress_row_limit' using errcode = '54000';
  end if;
  perform private.bump_write_counter(new.user_id, 'lesson_progress', private.cap_lesson_writes_per_hour(), interval '1 hour');
  return new;
end
$$;
create or replace function private.lesson_progress_update_caps() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  perform private.bump_write_counter(new.user_id, 'lesson_progress', private.cap_lesson_writes_per_hour(), interval '1 hour');
  return new;
end
$$;
revoke all on function private.lesson_progress_insert_caps() from public, anon, authenticated;
revoke all on function private.lesson_progress_update_caps() from public, anon, authenticated;
drop trigger if exists lesson_progress_insert_caps on public.lesson_progress;
create trigger lesson_progress_insert_caps before insert on public.lesson_progress
  for each row execute function private.lesson_progress_insert_caps();
drop trigger if exists lesson_progress_update_caps on public.lesson_progress;
create trigger lesson_progress_update_caps before update on public.lesson_progress
  for each row execute function private.lesson_progress_update_caps();

-- game_scores: an hourly insert cap, a row cap per user, and only the best N rows per game id are kept.
create or replace function private.game_scores_insert_caps() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  perform private.lock_user_rows(new.user_id);
  if (select pg_catalog.count(*) from public.game_scores g where g.user_id = new.user_id) >= private.cap_game_rows() then
    raise exception 'game_scores_row_limit' using errcode = '54000';
  end if;
  perform private.bump_write_counter(new.user_id, 'game_scores', private.cap_game_inserts_per_hour(), interval '1 hour');
  return new;
end
$$;
create or replace function private.game_scores_prune() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  delete from public.game_scores g
  where g.user_id = new.user_id and g.game_id = new.game_id
    and g.id not in (
      select k.id from public.game_scores k
      where k.user_id = new.user_id and k.game_id = new.game_id
      order by k.score desc, k.id desc
      limit private.cap_game_rows_per_id()
    );
  return null;
end
$$;
revoke all on function private.game_scores_insert_caps() from public, anon, authenticated;
revoke all on function private.game_scores_prune() from public, anon, authenticated;
drop trigger if exists game_scores_insert_caps on public.game_scores;
create trigger game_scores_insert_caps before insert on public.game_scores
  for each row execute function private.game_scores_insert_caps();
drop trigger if exists game_scores_prune on public.game_scores;
create trigger game_scores_prune after insert on public.game_scores
  for each row execute function private.game_scores_prune();

-- mock_results
create or replace function private.mock_results_insert_caps() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  perform private.lock_user_rows(new.user_id);
  if (select pg_catalog.count(*) from public.mock_results m where m.user_id = new.user_id) >= private.cap_mock_rows() then
    raise exception 'mock_results_row_limit' using errcode = '54000';
  end if;
  perform private.bump_write_counter(new.user_id, 'mock_results', private.cap_mock_inserts_per_hour(), interval '1 hour');
  return new;
end
$$;
revoke all on function private.mock_results_insert_caps() from public, anon, authenticated;
drop trigger if exists mock_results_insert_caps on public.mock_results;
create trigger mock_results_insert_caps before insert on public.mock_results
  for each row execute function private.mock_results_insert_caps();

-- attempts: 0001 caps direct inserts per minute; this adds an hourly cap for them and a daily cap on every row
-- (merged rows included, counted 250 at a time, so merge cannot be used to get round it).
create or replace function private.attempts_volume_caps() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  c integer;
begin
  if new.merged then
    -- merge_guest_progress inserts up to 5000 rows one by one in ONE transaction. Updating one counter row 5000 times
    -- in a transaction is very slow (every update leaves a new row version), so count the merge in steps of 250 rows:
    -- the first row of each 250 is charged for all 250. (Rounding up is harmless: a day allows 30000.)
    c := coalesce(nullif(pg_catalog.current_setting('mtn.merged_rows', true), '')::integer, 0);
    perform pg_catalog.set_config('mtn.merged_rows', (c + 1)::text, true);
    if c % 250 = 0 then
      perform private.bump_write_counter(new.user_id, 'attempts_day', private.cap_attempts_per_day(), interval '1 day', 250);
    end if;
    return new;
  end if;
  perform private.bump_write_counter(new.user_id, 'attempts_hour', private.cap_attempts_per_hour(), interval '1 hour');
  perform private.bump_write_counter(new.user_id, 'attempts_day', private.cap_attempts_per_day(), interval '1 day');
  return new;
end
$$;
revoke all on function private.attempts_volume_caps() from public, anon, authenticated;
drop trigger if exists attempts_volume_caps on public.attempts;
create trigger attempts_volume_caps before insert on public.attempts
  for each row execute function private.attempts_volume_caps();

-- -----------------------------------------------------------------------------
-- 5. Merge payload cap: 2 MiB of JSON text (5000 attempts are about 1.3 MiB)
-- -----------------------------------------------------------------------------
create or replace function private.merge_max_payload_bytes() returns integer
  language sql immutable set search_path = ''
  as $$ select 2097152 $$;
