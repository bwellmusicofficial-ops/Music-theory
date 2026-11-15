-- =============================================================================
-- 0001_init.sql : accounts and learner data for Music Theory Now (P1-01)
--
-- Implements docs/accounts-and-data.md. Section references below use the
-- headings of that document: [Code names], [Sign-in mechanics], [Tables],
-- [Rules enforced in the database], [Functions], [Guest use], [Acceptance n].
--
-- Plain SQL, no psql meta-commands. Safe to run twice: types, domains, tables,
-- indexes use IF NOT EXISTS or duplicate-guarded blocks; functions use CREATE OR
-- REPLACE; triggers and policies are dropped and re-created; grants are
-- re-stated. (Re-running does NOT alter the shape of an existing table. Change
-- shape in a new numbered migration.)
--
-- MUST be run by the role that owns the database objects and has BYPASSRLS or
-- superuser (the `postgres` role in Supabase). Every SECURITY DEFINER function
-- here runs as that owner and relies on it bypassing row level security, which
-- is also why FORCE ROW LEVEL SECURITY costs nothing and protects against a
-- later change of owner to an ordinary role.
-- =============================================================================

-- Guard: refuse to run as a role that would silently break the definer functions.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception '0001_init must run as a role with BYPASSRLS or SUPERUSER (postgres in Supabase)';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Schemas. `private` holds helpers and trigger functions. It is not exposed
-- through the API and anon/authenticated get no privileges on it.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Constants in one place. Change a limit here (new migration), nowhere else.
-- -----------------------------------------------------------------------------
create or replace function private.attempts_per_minute() returns integer
  language sql immutable set search_path = ''
  as $$ select 240 $$;                    -- [Rules] attempts cap per user per minute
create or replace function private.merge_max_lessons() returns integer
  language sql immutable set search_path = ''
  as $$ select 500 $$;                    -- [Functions] merge_guest_progress bound
create or replace function private.merge_max_attempts() returns integer
  language sql immutable set search_path = ''
  as $$ select 5000 $$;                   -- [Functions] merge_guest_progress bound
create or replace function private.merge_max_attempts_per_hour() returns integer
  language sql immutable set search_path = ''
  as $$ select 10000 $$;                  -- merge cannot be used to get round the attempts cap
create or replace function private.merge_max_payload_bytes() returns integer
  language sql immutable set search_path = ''
  as $$ select 3145728 $$;                -- 3 MiB of JSON text

-- -----------------------------------------------------------------------------
-- Enum types. Values mirror src/lesson/schema.ts and src/lesson/contracts.ts.
-- Enum order matters: lesson_state and lesson_step compare "more advanced" with >.
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.age_band as enum ('under_18', 'adult');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.lesson_state as enum ('not-started', 'in-progress', 'complete', 'mastered');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.lesson_step as enum ('hook', 'explore', 'name', 'practice', 'challenge', 'recap');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.question_type as enum (
    'note-on-stave', 'play-keyboard', 'tap-rhythm', 'by-ear', 'complete-bar',
    'spot-mistake', 'ordering', 'multiple-choice', 'match-up');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.question_source as enum ('authored', 'generated');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.grade as enum ('start', '1', '2', '3', '4', '5', '6', '7', '8');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.block_match as enum ('exact', 'contains');
exception when duplicate_object then null; end $$;

-- Id domains: the same patterns as idSchema and skillIdSchema in lesson/schema.ts,
-- plus a length limit ([Rules]: "ids match the same patterns as the lesson schema").
do $$ begin
  create domain public.content_id as text
    check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(value) <= 100);
exception when duplicate_object then null; end $$;
do $$ begin
  create domain public.skill_id as text
    check (value ~ '^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$' and char_length(value) <= 100);
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Helper functions (private). None are callable by anon or authenticated.
-- -----------------------------------------------------------------------------

-- [Code names] "compared without case or separators": lower-case with every
-- non-alphanumeric character removed. Single source of truth: the generated
-- columns below call this.
create or replace function private.normalise_code_name(t text) returns text
  language sql immutable strict set search_path = ''
  as $$ select pg_catalog.lower(pg_catalog.regexp_replace(t, '[^A-Za-z0-9]', '', 'g')) $$;

-- [Code names] format rules that need no table: 3 to 20 of letters, digits, _ and -;
-- at least 3 letters or digits once separators are removed (so "___" is not a name);
-- never 8 or more digits anywhere (phone-like; the stricter reading of "8 or more
-- digits"); never email-like. The character set already excludes "@" and ".", so
-- email-like is caught in its spelled-out forms (joe_at_gmail_com) and by mail
-- provider names.
create or replace function private.code_name_format_ok(t text) returns boolean
  language plpgsql immutable set search_path = ''
  as $$
declare
  n text;
begin
  if t is null or t !~ '^[A-Za-z0-9_-]{3,20}$' then
    return false;
  end if;
  n := private.normalise_code_name(t);
  if pg_catalog.char_length(n) < 3 then
    return false;
  end if;
  if pg_catalog.char_length(pg_catalog.regexp_replace(n, '[^0-9]', '', 'g')) >= 8 then
    return false;
  end if;
  if n ~ '(gmail|googlemail|hotmail|outlook|yahoo|icloud|protonmail|btinternet|aol|msn)' then
    return false;
  end if;
  if n ~ 'at[a-z0-9]+(com|couk|net|org|edu|ac)$' then
    return false;
  end if;
  return true;
end
$$;

-- Is the code name on the blocked list? Exact entries match the whole normalised
-- name; 'contains' entries match anywhere inside it. [Code names]
create or replace function private.code_name_blocked(t text) returns boolean
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  -- plpgsql so the function can be created before public.blocked_names exists.
  return exists (
    select 1
    from public.blocked_names b
    where (b.match = 'exact' and b.normalised = private.normalise_code_name(t))
       or (b.match = 'contains'
           and pg_catalog.strpos(private.normalise_code_name(t), b.normalised) > 0)
  );
end
$$;

-- Who is calling? These are NOT security definer, so current_user is the role
-- that issued the statement (or the function owner when called inside a
-- SECURITY DEFINER function, which is how confirm_adult() is recognised).
create or replace function private.caller_is_owner() returns boolean
  language plpgsql stable set search_path = ''
  as $$
begin
  return exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.confirm_adult()'::pg_catalog.regprocedure
      and r.rolname = current_user
  );
end
$$;

create or replace function private.caller_is_trusted() returns boolean
  language sql stable set search_path = ''
  as $$ select current_user = 'service_role' or private.caller_is_owner() $$;

-- Free-text control for settings ([Tables]: nothing free-text for an under 18).
-- Only the keys of LearnerSettings (src/lesson/contracts.ts), each with its own
-- allowed values. A new setting needs a new migration.
create or replace function private.settings_ok(s jsonb) returns boolean
  language plpgsql immutable set search_path = ''
  as $$
declare
  k text;
  v jsonb;
begin
  if s is null or pg_catalog.jsonb_typeof(s) <> 'object' then return false; end if;
  if pg_catalog.octet_length(s::text) > 1024 then return false; end if;
  for k, v in select key, value from pg_catalog.jsonb_each(s) loop
    if k = 'terminology' then
      if v not in ('"uk"'::jsonb, '"us"'::jsonb) then return false; end if;
    elsif k = 'theme' then
      if v not in ('"dark"'::jsonb, '"light"'::jsonb) then return false; end if;
    elsif k in ('soundOn', 'reducedMotion', 'untimed') then
      if v not in ('true'::jsonb, 'false'::jsonb) then return false; end if;
    elsif k = 'latencyOffsetMs' then
      if pg_catalog.jsonb_typeof(v) <> 'number' or v::numeric not between -1000 and 1000 then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end
$$;

-- game_scores.summary: small object of numbers and booleans only. No strings.
create or replace function private.summary_ok(s jsonb) returns boolean
  language plpgsql immutable set search_path = ''
  as $$
declare
  k text;
  v jsonb;
  n integer := 0;
begin
  if s is null or pg_catalog.jsonb_typeof(s) <> 'object' then return false; end if;
  if pg_catalog.octet_length(s::text) > 2048 then return false; end if;
  for k, v in select key, value from pg_catalog.jsonb_each(s) loop
    n := n + 1;
    if n > 20 or k !~ '^[a-zA-Z][a-zA-Z0-9]{0,30}$' then return false; end if;
    if pg_catalog.jsonb_typeof(v) not in ('number', 'boolean') then return false; end if;
  end loop;
  return true;
end
$$;

-- mock_results.breakdown: per-topic score, key = skill or strand id, value 0..1.
create or replace function private.breakdown_ok(s jsonb) returns boolean
  language plpgsql immutable set search_path = ''
  as $$
declare
  k text;
  v jsonb;
  n integer := 0;
begin
  if s is null or pg_catalog.jsonb_typeof(s) <> 'object' then return false; end if;
  if pg_catalog.octet_length(s::text) > 4096 then return false; end if;
  for k, v in select key, value from pg_catalog.jsonb_each(s) loop
    n := n + 1;
    if n > 60 or k !~ '^[a-z0-9-]+(\.[a-z0-9-]+){0,3}$' or pg_catalog.char_length(k) > 60 then
      return false;
    end if;
    if pg_catalog.jsonb_typeof(v) <> 'number' or v::numeric not between 0 and 1 then
      return false;
    end if;
  end loop;
  return true;
end
$$;

-- -----------------------------------------------------------------------------
-- Tables. [Tables]. All keyed to auth.users(id) ON DELETE CASCADE so that
-- delete_my_account() leaves nothing behind [Acceptance 8].
-- -----------------------------------------------------------------------------

-- profiles: one row per user. code_name is nullable (email-only adults).
-- code_name_norm is generated, unique, and is what makes "Rhythm_Fox",
-- "rhythmfox" and "RHYTHM-FOX" the same name [Code names, Acceptance 5].
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  code_name          text,
  code_name_norm     text generated always as (private.normalise_code_name(code_name)) stored,
  age_band           public.age_band not null default 'under_18',
  adult_confirmed_at timestamptz,
  settings           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint profiles_code_name_format check (code_name is null or private.code_name_format_ok(code_name)),
  constraint profiles_code_name_norm_unique unique (code_name_norm),
  constraint profiles_settings_valid check (private.settings_ok(settings)),
  constraint profiles_adult_confirmed_matches check ((age_band = 'adult') = (adult_confirmed_at is not null))
);

-- adult_contacts: only for adult profiles (trigger below) [Acceptance 4].
create table if not exists public.adult_contacts (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  full_name                text,
  marketing_opt_in         boolean not null default false,
  marketing_opted_in_at    timestamptz,
  marketing_wording_version text,
  marketing_withdrawn_at   timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint adult_contacts_full_name_len check (full_name is null or (char_length(btrim(full_name)) between 1 and 100)),
  constraint adult_contacts_wording_format check (
    marketing_wording_version is null or marketing_wording_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  constraint adult_contacts_opt_in_recorded check (
    not marketing_opt_in or (marketing_opted_in_at is not null and marketing_wording_version is not null))
);

-- account_secrets: service role only. bcrypt hash of the recovery code and the
-- failed-attempt counters used by the server routes' rate limiting.
create table if not exists public.account_secrets (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  recovery_code_hash  text not null,
  failed_attempts     integer not null default 0,
  last_failed_at      timestamptz,
  locked_until        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint account_secrets_bcrypt check (recovery_code_hash ~ '^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
  constraint account_secrets_failed_nonneg check (failed_attempts >= 0)
);

-- blocked_names: service role only. `normalised` is generated from `word`.
-- 'contains' entries need 3+ characters so a short entry cannot block everything.
create table if not exists public.blocked_names (
  id         bigint generated always as identity primary key,
  word       text not null,
  normalised text generated always as (private.normalise_code_name(word)) stored,
  match      public.block_match not null default 'exact',
  created_at timestamptz not null default now(),
  constraint blocked_names_word_len check (char_length(word) between 1 and 40),
  constraint blocked_names_normalised_nonempty check (char_length(normalised) >= 1),
  constraint blocked_names_contains_min check (match <> 'contains' or char_length(normalised) >= 3),
  constraint blocked_names_unique unique (normalised, match)
);

-- lesson_progress: mirrors LessonProgress in src/lesson/contracts.ts.
create table if not exists public.lesson_progress (
  user_id        uuid not null references auth.users (id) on delete cascade,
  lesson_id      public.content_id not null,
  state          public.lesson_state not null default 'in-progress',
  step           public.lesson_step not null default 'hook',
  question_index integer not null default 0,
  best_score     double precision,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, lesson_id),
  constraint lesson_progress_question_index check (question_index between 0 and 1000),
  constraint lesson_progress_best_score check (best_score is null or best_score between 0 and 1)
);

-- attempts: mirrors AttemptEvent. Append only for the owner [Acceptance 7].
--   source   = the question's source in the lesson schema (authored or generated)
--   occurred_at = AttemptEvent.at as reported by the device (never used for limits)
--   created_at  = server time, used for the rate cap
--   merged   = true only for rows written by merge_guest_progress
-- Dedupe key (merge and direct insert): (user_id, lesson_id, step, question_id, occurred_at).
create table if not exists public.attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  lesson_id   public.content_id not null,
  step        public.lesson_step not null,
  question_id public.content_id not null,
  skill       public.skill_id not null,
  type        public.question_type not null,
  correct     boolean not null,
  score       double precision not null,
  ms_taken    integer not null,
  seed        bigint,
  source      public.question_source not null default 'authored',
  occurred_at timestamptz not null,
  merged      boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint attempts_score_range check (score between 0 and 1),
  constraint attempts_ms_taken_range check (ms_taken between 0 and 3600000),
  constraint attempts_seed_range check (seed is null or seed between -9007199254740991 and 9007199254740991)
);

create table if not exists public.game_scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  game_id    text not null,
  score      integer not null,
  summary    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint game_scores_game_id check (game_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(game_id) <= 50),
  -- Game scores are points, not the 0..1 lesson score. Bounded, non-negative.
  constraint game_scores_score_range check (score between 0 and 1000000),
  constraint game_scores_summary_valid check (private.summary_ok(summary))
);

create table if not exists public.mock_results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  grade      public.grade not null,
  score      double precision not null,
  breakdown  jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mock_results_score_range check (score between 0 and 1),
  constraint mock_results_breakdown_valid check (private.breakdown_ok(breakdown))
);

-- -----------------------------------------------------------------------------
-- Indexes. Primary keys and the unique constraints above already index
-- (user_id) for profiles, adult_contacts, account_secrets, lesson_progress.
-- -----------------------------------------------------------------------------
create unique index if not exists attempts_dedupe_key
  on public.attempts (user_id, lesson_id, step, question_id, occurred_at);
create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index if not exists attempts_user_lesson_idx on public.attempts (user_id, lesson_id, occurred_at desc);
create index if not exists game_scores_user_created_idx on public.game_scores (user_id, created_at desc);
create index if not exists game_scores_user_game_idx on public.game_scores (user_id, game_id, score desc);
create index if not exists mock_results_user_created_idx on public.mock_results (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Trigger functions. [Rules enforced in the database]
-- -----------------------------------------------------------------------------

-- updated_at maintenance.
create or replace function private.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- profiles: age band set once, raised only through confirm_adult(); code_name
-- not changeable by the row owner; user_id immutable. Not SECURITY DEFINER on
-- purpose: it must see who is calling.
create or replace function private.profiles_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_op = 'INSERT' then
    if new.age_band = 'adult' then
      new.adult_confirmed_at := coalesce(new.adult_confirmed_at, pg_catalog.now());
    else
      new.adult_confirmed_at := null;
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'profiles.user_id cannot change' using errcode = '42501';
  end if;

  if new.age_band is distinct from old.age_band then
    -- Only under_18 -> adult, and only from inside confirm_adult() (or its owner).
    if not (old.age_band = 'under_18' and new.age_band = 'adult' and private.caller_is_owner()) then
      raise exception 'age_band can only be raised through confirm_adult()' using errcode = '42501';
    end if;
    new.adult_confirmed_at := pg_catalog.now();
  else
    new.adult_confirmed_at := old.adult_confirmed_at;
  end if;

  if new.code_name is distinct from old.code_name and not private.caller_is_trusted() then
    raise exception 'code_name cannot be changed directly' using errcode = '42501';
  end if;
  return new;
end
$$;

-- profiles: blocked list check on insert or when the code name changes.
create or replace function private.profiles_blocked_name_check() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if new.code_name is not null
     and (tg_op = 'INSERT' or new.code_name is distinct from old.code_name)
     and private.code_name_blocked(new.code_name) then
    raise exception 'code name not allowed' using errcode = '23514';
  end if;
  return new;
end
$$;

-- adult_contacts only for an adult profile [Acceptance 4]. SECURITY DEFINER so
-- it can read profiles whoever writes.
create or replace function private.adult_contacts_guard() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'adult_contacts.user_id cannot change' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p where p.user_id = new.user_id and p.age_band = 'adult'
  ) then
    raise exception 'adult_contacts requires an adult profile' using errcode = '23514';
  end if;
  return new;
end
$$;

-- lesson_progress: best_score never decreases; complete/mastered never reverts.
create or replace function private.lesson_progress_monotonic() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  new.best_score := greatest(old.best_score, new.best_score);   -- greatest() ignores NULL
  if old.state >= 'complete' and new.state < old.state then
    new.state := old.state;
  end if;
  return new;
end
$$;

-- attempts: lock + count helper (definer, so the count works for any caller).
create or replace function private.recent_attempt_count(uid uuid) returns integer
  language plpgsql security definer set search_path = ''
  as $$
declare
  c integer;
begin
  -- Serialise concurrent inserts for one user so the cap cannot be raced.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 17));
  select pg_catalog.count(*)::integer into c
  from public.attempts a
  where a.user_id = uid and not a.merged
    and a.created_at > pg_catalog.now() - interval '1 minute';
  return c;
end
$$;

-- attempts: insert cap per user per minute. SECURITY DEFINER so the count works
-- for any caller. Rows with merged = true (only merge_guest_progress and the
-- service role can set it; users have no privilege on that column) are not
-- capped here: merge has its own limits.
create or replace function private.attempts_rate_cap() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if new.merged then
    return new;
  end if;
  if private.recent_attempt_count(new.user_id) >= private.attempts_per_minute() then
    raise exception 'attempts_rate_limited' using errcode = '53400',
      hint = 'Too many attempts recorded in the last minute';
  end if;
  return new;
end
$$;

-- Profile row for every new auth user. Defaults are the most protective:
-- under_18, no code name. Only the server can set app_metadata (it is not
-- user-editable, unlike user_metadata), so the server routes pass
-- {"code_name": "...", "age_band": "adult"} there. A refused code name makes the
-- whole user creation fail, so a name cannot be taken twice even in a race.
create or replace function private.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (user_id, code_name, age_band)
  values (
    new.id,
    nullif(meta ->> 'code_name', ''),
    case when meta ->> 'age_band' = 'adult' then 'adult'::public.age_band
         else 'under_18'::public.age_band end
  );
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Triggers (dropped and re-created so the migration can be re-run).
-- -----------------------------------------------------------------------------
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.profiles_guard();
drop trigger if exists profiles_blocked_name_check on public.profiles;
create trigger profiles_blocked_name_check before insert or update on public.profiles
  for each row execute function private.profiles_blocked_name_check();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

drop trigger if exists adult_contacts_guard on public.adult_contacts;
create trigger adult_contacts_guard before insert or update on public.adult_contacts
  for each row execute function private.adult_contacts_guard();
drop trigger if exists adult_contacts_touch on public.adult_contacts;
create trigger adult_contacts_touch before update on public.adult_contacts
  for each row execute function private.touch_updated_at();

drop trigger if exists account_secrets_touch on public.account_secrets;
create trigger account_secrets_touch before update on public.account_secrets
  for each row execute function private.touch_updated_at();

drop trigger if exists lesson_progress_monotonic on public.lesson_progress;
create trigger lesson_progress_monotonic before update on public.lesson_progress
  for each row execute function private.lesson_progress_monotonic();
drop trigger if exists lesson_progress_touch on public.lesson_progress;
create trigger lesson_progress_touch before update on public.lesson_progress
  for each row execute function private.touch_updated_at();

drop trigger if exists attempts_rate_cap on public.attempts;
create trigger attempts_rate_cap before insert on public.attempts
  for each row execute function private.attempts_rate_cap();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row level security. ENABLED AND FORCED on every table [Tables, Acceptance 1-3].
-- -----------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.adult_contacts  enable row level security;
alter table public.account_secrets enable row level security;
alter table public.blocked_names   enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.attempts        enable row level security;
alter table public.game_scores     enable row level security;
alter table public.mock_results    enable row level security;

alter table public.profiles        force row level security;
alter table public.adult_contacts  force row level security;
alter table public.account_secrets force row level security;
alter table public.blocked_names   force row level security;
alter table public.lesson_progress force row level security;
alter table public.attempts        force row level security;
alter table public.game_scores     force row level security;
alter table public.mock_results    force row level security;

-- Policies: authenticated role only, own rows only, exactly the "User can"
-- column of [Tables]. No policy for anon anywhere. No policies at all on
-- account_secrets and blocked_names (RLS with no policy denies everything).

-- profiles: read and update own (no insert, no delete).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- adult_contacts: read and update own (the row itself is created by
-- set_marketing() or the server; the adult-only trigger applies to both).
drop policy if exists adult_contacts_select_own on public.adult_contacts;
create policy adult_contacts_select_own on public.adult_contacts for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists adult_contacts_update_own on public.adult_contacts;
create policy adult_contacts_update_own on public.adult_contacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- lesson_progress: read own; insert and update own.
drop policy if exists lesson_progress_select_own on public.lesson_progress;
create policy lesson_progress_select_own on public.lesson_progress for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists lesson_progress_insert_own on public.lesson_progress;
create policy lesson_progress_insert_own on public.lesson_progress for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists lesson_progress_update_own on public.lesson_progress;
create policy lesson_progress_update_own on public.lesson_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- attempts: read own; insert own; never update or delete.
drop policy if exists attempts_select_own on public.attempts;
create policy attempts_select_own on public.attempts for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists attempts_insert_own on public.attempts;
create policy attempts_insert_own on public.attempts for insert to authenticated
  with check (user_id = (select auth.uid()));

-- game_scores, mock_results: read own; insert own.
drop policy if exists game_scores_select_own on public.game_scores;
create policy game_scores_select_own on public.game_scores for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists game_scores_insert_own on public.game_scores;
create policy game_scores_insert_own on public.game_scores for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists mock_results_select_own on public.mock_results;
create policy mock_results_select_own on public.mock_results for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists mock_results_insert_own on public.mock_results;
create policy mock_results_insert_own on public.mock_results for insert to authenticated
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Privileges. Supabase grants ALL on new public tables to anon, authenticated
-- and service_role by default. Take everything away, then grant back only what
-- the policies above need, column by column where a column must stay server-owned.
-- -----------------------------------------------------------------------------
revoke all on table
  public.profiles, public.adult_contacts, public.account_secrets, public.blocked_names,
  public.lesson_progress, public.attempts, public.game_scores, public.mock_results
  from public, anon, authenticated;
revoke all on sequence public.attempts_id_seq, public.game_scores_id_seq,
  public.mock_results_id_seq, public.blocked_names_id_seq
  from public, anon, authenticated;

-- profiles: settings is the only column a user may write. code_name and
-- age_band changes are also refused by trigger (defence in depth).
grant select on public.profiles to authenticated;
grant update (settings) on public.profiles to authenticated;

-- adult_contacts: full_name only. Marketing columns change through set_marketing()
-- so the time and wording version are always recorded.
grant select on public.adult_contacts to authenticated;
grant update (full_name) on public.adult_contacts to authenticated;

grant select on public.lesson_progress to authenticated;
grant insert (user_id, lesson_id, state, step, question_index, best_score)
  on public.lesson_progress to authenticated;
grant update (state, step, question_index, best_score) on public.lesson_progress to authenticated;

grant select on public.attempts to authenticated;
grant insert (user_id, lesson_id, step, question_id, skill, type, correct, score,
              ms_taken, seed, source, occurred_at)
  on public.attempts to authenticated;

grant select on public.game_scores to authenticated;
grant insert (user_id, game_id, score, summary) on public.game_scores to authenticated;

grant select on public.mock_results to authenticated;
grant insert (user_id, grade, score, breakdown) on public.mock_results to authenticated;

-- account_secrets and blocked_names: nothing for anon or authenticated.

-- service_role (server routes only) bypasses RLS but still needs table privileges.
grant select, insert, update, delete on
  public.profiles, public.adult_contacts, public.account_secrets, public.blocked_names,
  public.lesson_progress, public.attempts, public.game_scores, public.mock_results
  to service_role;
grant usage on all sequences in schema public to service_role;

-- Everything in `private` is internal.
do $$
declare
  f record;
begin
  for f in
    select p.oid::pg_catalog.regprocedure as sig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;

-- Postgres checks EXECUTE at run time for functions used in CHECK constraints,
-- generated columns and invoker-rights triggers, so the roles that write rows
-- need USAGE on `private` and EXECUTE on exactly these pure functions. They take
-- a value (or look only at the caller's role) and read no table. `private` is
-- not an exposed API schema, so none of this is reachable over the API.
grant usage on schema private to authenticated, service_role;
grant execute on function
  private.caller_is_owner(),
  private.caller_is_trusted(),
  private.normalise_code_name(text),
  private.code_name_format_ok(text),
  private.settings_ok(jsonb),
  private.summary_ok(jsonb),
  private.breakdown_ok(jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Public functions [Functions]. SECURITY DEFINER, search_path = '', every name
-- qualified. Each is granted only to the role in the "Caller" column.
-- -----------------------------------------------------------------------------

-- code_name_available(text): caller = server route (service_role).
-- Yes/no only; never reveals why. Applies format, normalisation, uniqueness, blocked list.
create or replace function public.code_name_available(candidate text) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select candidate is not null
      and private.code_name_format_ok(candidate)
      and not private.code_name_blocked(candidate)
      and not exists (
        select 1 from public.profiles p
        where p.code_name_norm = private.normalise_code_name(candidate)
      )
  $$;

-- confirm_adult(): caller = signed-in user. Moves under_18 -> adult and records
-- the time (the profiles trigger stamps adult_confirmed_at). Calling again as
-- an adult changes nothing.
create or replace function public.confirm_adult() returns void
  language plpgsql security definer set search_path = ''
  as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  update public.profiles set age_band = 'adult'
  where user_id = uid and age_band = 'under_18';
  if not found and not exists (select 1 from public.profiles where user_id = uid) then
    raise exception 'no profile' using errcode = 'P0002';
  end if;
end
$$;

-- set_marketing(opt_in, wording_version): caller = signed-in adult. Opt-in
-- records the time and wording version and needs a real, confirmed email
-- (double opt-in, [Privacy operations]). Withdrawal records when. Refuses for
-- under-18 profiles in both directions.
create or replace function public.set_marketing(opt_in boolean, wording_version text)
  returns boolean
  language plpgsql security definer set search_path = ''
  as $$
declare
  uid uuid := auth.uid();
  band public.age_band;
  mail text;
  confirmed timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if opt_in is null then
    raise exception 'opt_in is required' using errcode = '22023';
  end if;
  select p.age_band into band from public.profiles p where p.user_id = uid;
  if band is distinct from 'adult' then
    raise exception 'marketing preferences are for adults only' using errcode = '42501';
  end if;

  if opt_in then
    if wording_version is null or wording_version !~ '^[A-Za-z0-9._-]{1,40}$' then
      raise exception 'a wording version is required' using errcode = '22023';
    end if;
    select u.email, u.email_confirmed_at into mail, confirmed from auth.users u where u.id = uid;
    if mail is null or pg_catalog.lower(mail) like '%@accounts.invalid' or confirmed is null then
      raise exception 'a confirmed email address is required' using errcode = '42501';
    end if;
    insert into public.adult_contacts as c
      (user_id, marketing_opt_in, marketing_opted_in_at, marketing_wording_version, marketing_withdrawn_at)
    values (uid, true, pg_catalog.now(), wording_version, null)
    on conflict (user_id) do update
      set marketing_opt_in = true,
          marketing_opted_in_at = pg_catalog.now(),
          marketing_wording_version = excluded.marketing_wording_version,
          marketing_withdrawn_at = null;
    return true;
  end if;

  update public.adult_contacts
  set marketing_opt_in = false, marketing_withdrawn_at = pg_catalog.now()
  where user_id = uid;
  return false;
end
$$;

-- delete_my_account(): caller = signed-in user. Deleting the auth user cascades
-- to every table. (Foreign key actions bypass RLS.)
create or replace function public.delete_my_account() returns void
  language plpgsql security definer set search_path = ''
  as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end
$$;

-- export_my_data(): caller = signed-in user. Everything held about the caller
-- as JSON. account_secrets is summarised without the hash (a hash is not useful
-- to the person and is a credential). The email is included only when it is a
-- real one, not the synthetic @accounts.invalid address.
create or replace function public.export_my_data() returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  return pg_catalog.jsonb_build_object(
    'exported_at', pg_catalog.now(),
    'account', (
      select pg_catalog.jsonb_build_object(
        'user_id', u.id,
        'email', case when u.email is null or pg_catalog.lower(u.email) like '%@accounts.invalid'
                      then null else u.email end,
        'created_at', u.created_at)
      from auth.users u where u.id = uid),
    'profile', (select pg_catalog.to_jsonb(p) from public.profiles p where p.user_id = uid),
    'adult_contact', (select pg_catalog.to_jsonb(c) from public.adult_contacts c where c.user_id = uid),
    'account_secrets', (
      select pg_catalog.jsonb_build_object(
        'has_recovery_code', true,
        'failed_attempts', s.failed_attempts,
        'last_failed_at', s.last_failed_at,
        'locked_until', s.locked_until,
        'created_at', s.created_at,
        'updated_at', s.updated_at)
      from public.account_secrets s where s.user_id = uid),
    'lesson_progress', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.lesson_id)
      from public.lesson_progress l where l.user_id = uid), '[]'::jsonb),
    'attempts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.id)
      from public.attempts a where a.user_id = uid), '[]'::jsonb),
    'game_scores', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g) order by g.id)
      from public.game_scores g where g.user_id = uid), '[]'::jsonb),
    'mock_results', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.id)
      from public.mock_results m where m.user_id = uid), '[]'::jsonb)
  );
end
$$;

-- merge_guest_progress(jsonb): caller = signed-in user. [Guest use]
--
-- Payload (camelCase, mirroring LessonProgress and AttemptEvent):
--   { "lessons":  [ {lessonId, state, step, questionIndex, bestScore?} ... ],
--     "attempts": [ {lessonId, step, questionId, skill, type, correct, score,
--                    msTaken, seed?, at, source?} ... ] }
-- Rules:
--  * The user is always auth.uid(). Any userId/user_id in the payload is ignored.
--  * Hard bounds: payload under 3 MiB, at most 500 lessons and 5000 attempts,
--    arrays or an object required; breaking a bound raises an error and writes
--    nothing. Merged attempts are limited to 10000 per user per hour so this
--    function cannot be used to flood the table.
--  * Every field is validated against the same rules as the tables. A malformed
--    element is skipped and counted, never repaired and never fatal.
--  * Lessons: keep the more advanced state and the greater best_score; resume
--    position comes from whichever row is further along (state, step, index).
--    Client timestamps on lessons are ignored. Not-started rows are accepted.
--  * Attempts: inserted with merged = true. DEDUPE KEY = (user_id, lessonId,
--    step, questionId, at). A row with the same key is counted as a duplicate
--    and not inserted, so the same payload twice adds nothing the second time.
--    `at` must be ISO 8601 between 2020-01-01 and one day from now.
--  * Returns counts: lessons_merged, lessons_skipped, attempts_inserted,
--    attempts_duplicate, attempts_skipped.
create or replace function public.merge_guest_progress(payload jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  uid uuid := auth.uid();
  lessons jsonb;
  atts jsonb;
  e jsonb;
  v_lesson text;
  v_state public.lesson_state;
  v_step public.lesson_step;
  v_qidx integer;
  v_best double precision;
  v_qid text;
  v_skill text;
  v_type public.question_type;
  v_correct boolean;
  v_score double precision;
  v_ms integer;
  v_seed bigint;
  v_source public.question_source;
  v_at timestamptz;
  n_lessons_ok integer := 0;
  n_lessons_bad integer := 0;
  n_att_ok integer := 0;
  n_att_dup integer := 0;
  n_att_bad integer := 0;
  rc integer;
  merged_last_hour integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(payload::text) > private.merge_max_payload_bytes() then
    raise exception 'payload too large' using errcode = '54000';
  end if;

  lessons := coalesce(payload -> 'lessons', '[]'::jsonb);
  atts := coalesce(payload -> 'attempts', '[]'::jsonb);
  if pg_catalog.jsonb_typeof(lessons) <> 'array' or pg_catalog.jsonb_typeof(atts) <> 'array' then
    raise exception 'lessons and attempts must be arrays' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(lessons) > private.merge_max_lessons()
     or pg_catalog.jsonb_array_length(atts) > private.merge_max_attempts() then
    raise exception 'payload too large' using errcode = '54000';
  end if;

  -- One merge at a time per user; also gives the hourly limit a stable count.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 29));
  select pg_catalog.count(*)::integer into merged_last_hour
  from public.attempts a
  where a.user_id = uid and a.merged and a.created_at > pg_catalog.now() - interval '1 hour';
  if merged_last_hour + pg_catalog.jsonb_array_length(atts) > private.merge_max_attempts_per_hour() then
    raise exception 'merge_rate_limited' using errcode = '53400';
  end if;

  -- Lessons ---------------------------------------------------------------
  for e in select value from pg_catalog.jsonb_array_elements(lessons) loop
    begin
      if pg_catalog.jsonb_typeof(e) <> 'object'
         or pg_catalog.jsonb_typeof(e -> 'lessonId') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'state') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'step') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'questionIndex') <> 'number' then
        n_lessons_bad := n_lessons_bad + 1;
        continue;
      end if;
      v_lesson := e ->> 'lessonId';
      if v_lesson !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or pg_catalog.char_length(v_lesson) > 100
         or not ((e ->> 'state') = any (pg_catalog.enum_range(null::public.lesson_state)::text[]))
         or not ((e ->> 'step') = any (pg_catalog.enum_range(null::public.lesson_step)::text[]))
         or (e -> 'questionIndex')::text !~ '^[0-9]{1,4}$' then
        n_lessons_bad := n_lessons_bad + 1;
        continue;
      end if;
      v_state := (e ->> 'state')::public.lesson_state;
      v_step := (e ->> 'step')::public.lesson_step;
      v_qidx := (e -> 'questionIndex')::text::integer;
      if v_qidx > 1000 then
        n_lessons_bad := n_lessons_bad + 1;
        continue;
      end if;
      v_best := null;
      if e ? 'bestScore' and pg_catalog.jsonb_typeof(e -> 'bestScore') <> 'null' then
        if pg_catalog.jsonb_typeof(e -> 'bestScore') <> 'number'
           or (e -> 'bestScore')::numeric not between 0 and 1 then
          n_lessons_bad := n_lessons_bad + 1;
          continue;
        end if;
        v_best := (e -> 'bestScore')::numeric::double precision;
      end if;

      insert into public.lesson_progress as lp
        (user_id, lesson_id, state, step, question_index, best_score)
      values (uid, v_lesson, v_state, v_step, v_qidx, v_best)
      on conflict (user_id, lesson_id) do update set
        state = greatest(lp.state, excluded.state),
        best_score = greatest(lp.best_score, excluded.best_score),
        step = case when (excluded.state, excluded.step, excluded.question_index)
                         > (lp.state, lp.step, lp.question_index)
                    then excluded.step else lp.step end,
        question_index = case when (excluded.state, excluded.step, excluded.question_index)
                         > (lp.state, lp.step, lp.question_index)
                    then excluded.question_index else lp.question_index end;
      n_lessons_ok := n_lessons_ok + 1;
    exception when others then
      n_lessons_bad := n_lessons_bad + 1;
    end;
  end loop;

  -- Attempts ----------------------------------------------------------------
  for e in select value from pg_catalog.jsonb_array_elements(atts) loop
    begin
      if pg_catalog.jsonb_typeof(e) <> 'object'
         or pg_catalog.jsonb_typeof(e -> 'lessonId') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'step') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'questionId') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'skill') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'type') <> 'string'
         or pg_catalog.jsonb_typeof(e -> 'correct') <> 'boolean'
         or pg_catalog.jsonb_typeof(e -> 'score') <> 'number'
         or pg_catalog.jsonb_typeof(e -> 'msTaken') <> 'number'
         or pg_catalog.jsonb_typeof(e -> 'at') <> 'string' then
        n_att_bad := n_att_bad + 1;
        continue;
      end if;
      v_lesson := e ->> 'lessonId';
      v_qid := e ->> 'questionId';
      v_skill := e ->> 'skill';
      if v_lesson !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or pg_catalog.char_length(v_lesson) > 100
         or v_qid !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or pg_catalog.char_length(v_qid) > 100
         or v_skill !~ '^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$' or pg_catalog.char_length(v_skill) > 100
         or not ((e ->> 'step') = any (pg_catalog.enum_range(null::public.lesson_step)::text[]))
         or not ((e ->> 'type') = any (pg_catalog.enum_range(null::public.question_type)::text[]))
         or (e -> 'score')::numeric not between 0 and 1
         or (e -> 'msTaken')::text !~ '^[0-9]{1,7}$'
         or (e ->> 'at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
        n_att_bad := n_att_bad + 1;
        continue;
      end if;
      v_ms := (e -> 'msTaken')::text::integer;
      if v_ms > 3600000 then
        n_att_bad := n_att_bad + 1;
        continue;
      end if;
      v_seed := null;
      if e ? 'seed' and pg_catalog.jsonb_typeof(e -> 'seed') <> 'null' then
        if pg_catalog.jsonb_typeof(e -> 'seed') <> 'number' or (e -> 'seed')::text !~ '^-?[0-9]{1,15}$' then
          n_att_bad := n_att_bad + 1;
          continue;
        end if;
        v_seed := (e -> 'seed')::text::bigint;
      end if;
      v_source := 'authored';
      if e ? 'source' and pg_catalog.jsonb_typeof(e -> 'source') <> 'null' then
        if pg_catalog.jsonb_typeof(e -> 'source') <> 'string'
           or not ((e ->> 'source') = any (pg_catalog.enum_range(null::public.question_source)::text[])) then
          n_att_bad := n_att_bad + 1;
          continue;
        end if;
        v_source := (e ->> 'source')::public.question_source;
      end if;
      v_at := (e ->> 'at')::timestamptz;       -- may raise for an impossible date: caught below
      if v_at < timestamptz '2020-01-01 00:00:00+00' or v_at > pg_catalog.now() + interval '1 day' then
        n_att_bad := n_att_bad + 1;
        continue;
      end if;
      v_type := (e ->> 'type')::public.question_type;
      v_step := (e ->> 'step')::public.lesson_step;
      v_correct := (e ->> 'correct')::boolean;
      v_score := (e -> 'score')::numeric::double precision;

      insert into public.attempts
        (user_id, lesson_id, step, question_id, skill, type, correct, score,
         ms_taken, seed, source, occurred_at, merged)
      values (uid, v_lesson, v_step, v_qid, v_skill, v_type, v_correct, v_score,
              v_ms, v_seed, v_source, v_at, true)
      on conflict (user_id, lesson_id, step, question_id, occurred_at) do nothing;
      get diagnostics rc = row_count;
      if rc = 1 then n_att_ok := n_att_ok + 1; else n_att_dup := n_att_dup + 1; end if;
    exception when others then
      n_att_bad := n_att_bad + 1;
    end;
  end loop;

  return pg_catalog.jsonb_build_object(
    'lessons_merged', n_lessons_ok,
    'lessons_skipped', n_lessons_bad,
    'attempts_inserted', n_att_ok,
    'attempts_duplicate', n_att_dup,
    'attempts_skipped', n_att_bad);
end
$$;

-- Grants on the public functions: revoke the PUBLIC / anon / authenticated
-- defaults first, then grant only to the "Caller" role.
revoke all on function public.code_name_available(text) from public, anon, authenticated, service_role;
revoke all on function public.merge_guest_progress(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.export_my_data() from public, anon, authenticated, service_role;
revoke all on function public.delete_my_account() from public, anon, authenticated, service_role;
revoke all on function public.confirm_adult() from public, anon, authenticated, service_role;
revoke all on function public.set_marketing(boolean, text) from public, anon, authenticated, service_role;

grant execute on function public.code_name_available(text) to service_role;   -- server route
grant execute on function public.merge_guest_progress(jsonb) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.confirm_adult() to authenticated;
grant execute on function public.set_marketing(boolean, text) to authenticated;
