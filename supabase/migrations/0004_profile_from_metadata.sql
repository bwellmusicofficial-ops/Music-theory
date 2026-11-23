-- 0004: fill the profile's code name and age band when Supabase saves the account's app metadata.
--
-- Found on 23 Nov 2026: Supabase Auth's admin createUser inserts the auth.users row first and writes
-- the custom app_metadata (code_name, age_band) in a later UPDATE. 0001's handle_new_user() runs on the
-- INSERT, so it saw no metadata: profiles were created with no code name and the default age band.
--
-- This adds an AFTER UPDATE trigger that copies the code name, and raises the age band to adult when the
-- metadata says so, for a profile that has no code name yet. The usual profile checks still apply
-- (format, blocked names, uniqueness), so a refused name fails the update. It also repairs existing
-- profiles. Additive and idempotent: safe to run twice.

create or replace function private.handle_user_metadata() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  if nullif(meta ->> 'code_name', '') is null then
    return new;
  end if;
  update public.profiles p
     set code_name = meta ->> 'code_name',
         age_band = case when meta ->> 'age_band' = 'adult' then 'adult'::public.age_band else p.age_band end
   where p.user_id = new.id
     and p.code_name is null;
  return new;
end
$$;

revoke all on function private.handle_user_metadata() from public, anon, authenticated;

drop trigger if exists on_auth_user_metadata on auth.users;
create trigger on_auth_user_metadata after update of raw_app_meta_data on auth.users
  for each row when (new.raw_app_meta_data is distinct from old.raw_app_meta_data)
  execute function private.handle_user_metadata();

-- Repair profiles created before this fix.
update public.profiles p
   set code_name = u.raw_app_meta_data ->> 'code_name',
       age_band = case when u.raw_app_meta_data ->> 'age_band' = 'adult' then 'adult'::public.age_band else p.age_band end
  from auth.users u
 where u.id = p.user_id
   and p.code_name is null
   and nullif(u.raw_app_meta_data ->> 'code_name', '') is not null;
