-- Role changes are administrator-only. Users retain permission to read their own role.
drop policy if exists "Admins read all user roles" on public.user_roles;
create policy "Admins read all user roles"
  on public.user_roles for select
  using (public.is_admin());

-- Role writes intentionally have no direct table policy. Administrators must
-- use admin_set_user_role so self-change and last-admin protections apply.

create or replace function public.audit_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if actor is not null then
    if tg_op = 'INSERT' then
      insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
      values (actor, 'staff_role_set_' || new.role, 'user', new.user_id, coalesce(nullif(current_setting('ownly.admin_reason', true), ''), 'Role granted or changed by an administrator'));
      return new;
    elsif tg_op = 'UPDATE' then
      if old.role is distinct from new.role then
        insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
        values (actor, 'staff_role_set_' || new.role, 'user', new.user_id, coalesce(nullif(current_setting('ownly.admin_reason', true), ''), 'Role changed by an administrator'));
      end if;
      return new;
    else
      insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
      values (actor, 'staff_role_removed', 'user', old.user_id, coalesce(nullif(current_setting('ownly.admin_reason', true), ''), 'Role removed by an administrator'));
      return old;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists audit_user_role_changes on public.user_roles;
create trigger audit_user_role_changes
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_user_role_change();

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid(); admin_count integer;
begin
  if not public.is_admin() then raise exception 'administrator access required' using errcode = '42501'; end if;
  if p_user_id = actor then raise exception 'administrators cannot change their own role' using errcode = '42501'; end if;
  if p_role not in ('admin', 'moderator', 'none') then raise exception 'invalid role' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 or length(trim(p_reason)) > 1000 then raise exception 'reason must be 5 to 1000 characters' using errcode = '22023'; end if;
  if p_role <> 'admin' then
    perform pg_advisory_xact_lock(hashtextextended('ownly-admin-role-count', 0));
    select count(*) into admin_count from public.user_roles where role = 'admin';
    if exists(select 1 from public.user_roles where user_id = p_user_id and role = 'admin') and admin_count <= 1 then
      raise exception 'the last administrator cannot be removed' using errcode = '42501';
    end if;
  end if;
  perform set_config('ownly.admin_reason', trim(p_reason), true);
  if p_role = 'none' then
    delete from public.user_roles where user_id = p_user_id;
  else
    insert into public.user_roles(user_id, role) values (p_user_id, p_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;
end;
$$;
revoke all on function public.admin_set_user_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;

create or replace function public.audit_user_restriction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if actor is not null then
    if tg_op = 'DELETE' then
      insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
      values (actor, 'user_restriction_lifted', 'user', old.user_id, coalesce(nullif(current_setting('ownly.admin_reason', true), ''), nullif(old.reason, ''), 'User restriction lifted by administrator'));
      return old;
    end if;
    insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
    values (actor, 'user_restricted', 'user', new.user_id, coalesce(nullif(current_setting('ownly.admin_reason', true), ''), new.reason));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_user_restriction_changes on public.user_restrictions;
create trigger audit_user_restriction_changes
  after insert or update or delete on public.user_restrictions
  for each row execute function public.audit_user_restriction_change();

create or replace function public.audit_staff_listing_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid(); action_name text;
begin
  if actor is null or not public.is_staff() then return new; end if;
  if old.status is distinct from new.status then action_name := 'listing_' || new.status::text;
  elsif old.title is distinct from new.title or old.description is distinct from new.description
     or old.price_minor is distinct from new.price_minor or old.currency is distinct from new.currency
     or old.category_id is distinct from new.category_id or old.transaction_mode is distinct from new.transaction_mode
     or old.attributes is distinct from new.attributes then action_name := 'listing_edited';
  else return new;
  end if;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
  values (actor, action_name, 'listing', new.id, coalesce(nullif(current_setting('ownly.admin_reason', true), ''), nullif(trim(new.moderation_note), ''), 'Administrative listing update'));
  return new;
end;
$$;
drop trigger if exists audit_staff_listing_updates on public.listings;
create trigger audit_staff_listing_updates
  after update on public.listings
  for each row execute function public.audit_staff_listing_changes();

-- Report state changes go through this transaction-safe function so each action has a reason and log.
drop policy if exists "Staff update reports" on public.reports;
create or replace function public.admin_review_report(p_report_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if not public.is_staff() then raise exception 'staff access required' using errcode = '42501'; end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'invalid report status' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 or length(trim(p_reason)) > 1000 then raise exception 'reason must be 5 to 1000 characters' using errcode = '22023'; end if;
  update public.reports set status = p_status where id = p_report_id and status in ('open', 'reviewing');
  if not found then raise exception 'report not found or already closed' using errcode = 'P0002'; end if;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
  values (actor, 'report_' || p_status, 'report', p_report_id, trim(p_reason));
end;
$$;
revoke all on function public.admin_review_report(uuid, text, text) from public, anon;
grant execute on function public.admin_review_report(uuid, text, text) to authenticated;

-- Only administrators can query auth.users; the public profiles table never exposes email.
create or replace function public.admin_search_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  bio text,
  avatar_path text,
  created_at timestamptz,
  restricted boolean,
  restriction_reason text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, p.display_name, p.bio, p.avatar_path, u.created_at,
           (r.user_id is not null), r.reason, ur.role
      from auth.users as u
      left join public.profiles as p on p.id = u.id
      left join public.user_restrictions as r on r.user_id = u.id
      left join public.user_roles as ur on ur.user_id = u.id
     where p_query is null or p_query = ''
        or coalesce(u.email, '') ilike '%' || p_query || '%'
        or coalesce(p.display_name, '') ilike '%' || p_query || '%'
        or u.id::text ilike '%' || p_query || '%'
     order by u.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_search_users(text, integer, integer) from public, anon;
grant execute on function public.admin_search_users(text, integer, integer) to authenticated;

-- Permanent listing deletion and its audit entry occur atomically in one database transaction.
create or replace function public.admin_delete_listing(p_listing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if actor is not null then
    perform set_config('ownly.admin_reason', trim(coalesce(p_reason, '')), true);
  end if;
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 or length(trim(p_reason)) > 1000 then
    raise exception 'deletion reason must be 10 to 1000 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.listings where id = p_listing_id) then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
  values (actor, 'listing_deleted', 'listing', p_listing_id, trim(p_reason));

  delete from public.listings where id = p_listing_id;
end;
$$;
revoke all on function public.admin_delete_listing(uuid, text) from public, anon;
grant execute on function public.admin_delete_listing(uuid, text) to authenticated;

-- Private profile edits use a public, size-limited bucket with per-user write paths.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ownly-avatars', 'ownly-avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Public avatar reads" on storage.objects;
create policy "Public avatar reads"
  on storage.objects for select
  using (bucket_id = 'ownly-avatars');

drop policy if exists "Users upload own avatar files" on storage.objects;
create policy "Users upload own avatar files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ownly-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own avatar files" on storage.objects;
create policy "Users update own avatar files"
  on storage.objects for update to authenticated
  using (bucket_id = 'ownly-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'ownly-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own avatar files" on storage.objects;
create policy "Users delete own avatar files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ownly-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
