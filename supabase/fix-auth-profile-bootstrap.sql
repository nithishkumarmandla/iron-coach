-- Fix for broken auth/profile bootstrap
--
-- Why signup fails:
-- - The custom trigger inserts every new profile with username = 'user'
-- - profiles.username is UNIQUE in schema.sql
-- - After the first signup, later signups fail with:
--   "Database error saving new user"
--
-- This project already repairs/creates missing profiles in the app,
-- so the safest fix is to remove the trigger and normalize any existing
-- placeholder usernames.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- Keep only one clear insert policy for profiles.
drop policy if exists "Allow insert own profile" on public.profiles;
drop policy if exists "Allow read own profile" on public.profiles;
drop policy if exists "Allow update own profile" on public.profiles;

create policy "Allow insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Allow read own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Allow update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Normalize any old placeholder username created by the broken trigger.
update public.profiles
set username = 'user_' || substring(id::text from 1 for 8)
where username = 'user';
