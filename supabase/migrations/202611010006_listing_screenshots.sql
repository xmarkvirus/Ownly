-- Private listing screenshot storage. Published listings are readable; the
-- seller may read their own pending listing images. RLS remains authoritative.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ownly-listing-images', 'ownly-listing-images', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_listing_screenshot(p_listing_folder text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select p_listing_folder is not null
    and exists (select 1 from public.listings l where l.id::text = p_listing_folder and l.seller_id = auth.uid())
    and (select count(*) from storage.objects o where o.bucket_id = 'ownly-listing-images' and (storage.foldername(o.name))[1] = p_listing_folder) < 8
$$;
revoke all on function public.can_upload_listing_screenshot(text) from public, anon;
grant execute on function public.can_upload_listing_screenshot(text) to authenticated;

drop policy if exists "Read published listing screenshots" on storage.objects;
create policy "Read published listing screenshots" on storage.objects for select to anon, authenticated
  using (bucket_id = 'ownly-listing-images' and exists (
    select 1 from public.listings l
     where l.id::text = (storage.foldername(name))[1] and (l.status = 'active' or public.is_staff())
  ));

drop policy if exists "Sellers read own listing screenshots" on storage.objects;
create policy "Sellers read own listing screenshots" on storage.objects for select to authenticated
  using (bucket_id = 'ownly-listing-images' and exists (
    select 1 from public.listings l
     where l.id::text = (storage.foldername(name))[1] and l.seller_id = auth.uid()
  ));

drop policy if exists "Sellers upload own listing screenshots" on storage.objects;
create policy "Sellers upload own listing screenshots" on storage.objects for insert to authenticated
  with check (bucket_id = 'ownly-listing-images' and public.can_upload_listing_screenshot((storage.foldername(name))[1]));

drop policy if exists "Sellers update own listing screenshots" on storage.objects;
create policy "Sellers update own listing screenshots" on storage.objects for update to authenticated
  using (bucket_id = 'ownly-listing-images' and exists (
    select 1 from public.listings l where l.id::text = (storage.foldername(name))[1] and l.seller_id = auth.uid()
  ))
  with check (bucket_id = 'ownly-listing-images' and exists (
    select 1 from public.listings l where l.id::text = (storage.foldername(name))[1] and l.seller_id = auth.uid()
  ));

drop policy if exists "Sellers delete own listing screenshots" on storage.objects;
create policy "Sellers delete own listing screenshots" on storage.objects for delete to authenticated
  using (bucket_id = 'ownly-listing-images' and exists (
    select 1 from public.listings l
     where l.id::text = (storage.foldername(name))[1] and l.seller_id = auth.uid()
  ));

grant select on public.listing_images to anon, authenticated;
grant insert, update, delete on public.listing_images to authenticated;

create or replace function public.guard_listing_image()
returns trigger language plpgsql security definer set search_path = public as $$
declare image_count integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.listing_id::text, 0));
    select count(*) into image_count from public.listing_images where listing_id = new.listing_id;
    if image_count >= 8 then raise exception 'a listing may have at most 8 screenshots' using errcode = '22023'; end if;
  end if;
  if split_part(new.storage_path, '/', 1) <> new.listing_id::text then
    raise exception 'screenshot storage path must be scoped to its listing' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists listing_image_guard on public.listing_images;
create trigger listing_image_guard before insert or update on public.listing_images
  for each row execute function public.guard_listing_image();

create or replace function public.cleanup_listing_screenshot_objects()
returns trigger language plpgsql security definer set search_path = public, storage as $$
begin
  delete from storage.objects
   where bucket_id = 'ownly-listing-images'
     and (storage.foldername(name))[1] = old.id::text;
  return old;
end;
$$;
drop trigger if exists cleanup_listing_screenshots on public.listings;
create trigger cleanup_listing_screenshots before delete on public.listings
  for each row execute function public.cleanup_listing_screenshot_objects();
