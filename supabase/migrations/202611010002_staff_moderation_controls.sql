-- Staff can update report workflow state; ordinary users retain read-only access to their own reports.
drop policy if exists "Staff update reports" on public.reports;
create policy "Staff update reports"
  on public.reports
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- User restrictions are an administrator function; moderators keep moderation access only.
create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
$$;

drop policy if exists "Staff manage restrictions" on public.user_restrictions;
drop policy if exists "Admin manage restrictions" on public.user_restrictions;
create policy "Admin manage restrictions"
  on public.user_restrictions
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Restricted accounts can keep reading their data but cannot initiate new marketplace interactions.
drop policy if exists "Unrestricted accounts create favorites" on public.favorites;
create policy "Unrestricted accounts create favorites"
  on public.favorites as restrictive
  for insert to authenticated
  with check (not public.is_restricted());

drop policy if exists "Unrestricted accounts update listings" on public.listings;
create policy "Unrestricted accounts update listings"
  on public.listings as restrictive
  for update to authenticated
  using (not public.is_restricted())
  with check (not public.is_restricted());

drop policy if exists "Unrestricted accounts start conversations" on public.conversations;
create policy "Unrestricted accounts start conversations"
  on public.conversations as restrictive
  for insert to authenticated
  with check (not public.is_restricted());

drop policy if exists "Unrestricted accounts send messages" on public.messages;
create policy "Unrestricted accounts send messages"
  on public.messages as restrictive
  for insert to authenticated
  with check (not public.is_restricted());

drop policy if exists "Unrestricted accounts submit reports" on public.reports;
create policy "Unrestricted accounts submit reports"
  on public.reports as restrictive
  for insert to authenticated
  with check (not public.is_restricted());
