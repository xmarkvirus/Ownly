-- Bind every conversation to the seller who owns its referenced active listing.
drop policy if exists "Buyer starts conversation" on public.conversations;
create policy "Buyer starts conversation"
  on public.conversations
  for insert
  to authenticated
  with check (
    buyer_id = (select auth.uid())
    and exists (
      select 1
      from public.listings as l
      where l.id = conversations.listing_id
        and l.status = 'active'
        and l.seller_id = conversations.seller_id
    )
  );

-- Trigger-only functions run through installed triggers, not through the Data API.
-- Revoke direct RPC execution from client-facing roles; existing triggers remain installed.
revoke execute on function public.audit_user_role_change() from public, anon, authenticated, service_role;
revoke execute on function public.audit_user_restriction_change() from public, anon, authenticated, service_role;
revoke execute on function public.audit_staff_listing_changes() from public, anon, authenticated, service_role;
revoke execute on function public.cleanup_listing_screenshot_objects() from public, anon, authenticated, service_role;
revoke execute on function public.enforce_listing_policy() from public, anon, authenticated, service_role;
revoke execute on function public.guard_listing_image() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.protect_profile_fields() from public, anon, authenticated, service_role;
revoke execute on function public.rate_limit_message() from public, anon, authenticated, service_role;
