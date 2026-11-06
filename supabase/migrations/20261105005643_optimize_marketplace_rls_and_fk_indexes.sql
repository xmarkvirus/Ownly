-- Cache row-independent auth and authorization helper calls once per statement.
do $$
declare
  p record;
  using_expr text;
  check_expr text;
  command text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and policyname <> 'Buyer starts conversation'
      and (
        coalesce(qual, '') ~ '(auth\.uid\(\)|is_staff\(\)|is_admin\(\)|is_restricted\(\))'
        or coalesce(with_check, '') ~ '(auth\.uid\(\)|is_staff\(\)|is_admin\(\)|is_restricted\(\))'
      )
  loop
    using_expr := p.qual;
    check_expr := p.with_check;

    if using_expr is not null then
      using_expr := replace(using_expr, 'auth.uid()', '(select auth.uid())');
      using_expr := replace(using_expr, 'is_staff()', '(select public.is_staff())');
      using_expr := replace(using_expr, 'is_admin()', '(select public.is_admin())');
      using_expr := replace(using_expr, 'is_restricted()', '(select public.is_restricted())');
    end if;

    if check_expr is not null then
      check_expr := replace(check_expr, 'auth.uid()', '(select auth.uid())');
      check_expr := replace(check_expr, 'is_staff()', '(select public.is_staff())');
      check_expr := replace(check_expr, 'is_admin()', '(select public.is_admin())');
      check_expr := replace(check_expr, 'is_restricted()', '(select public.is_restricted())');
    end if;

    command := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if using_expr is not null then
      command := command || format(' using (%s)', using_expr);
    end if;
    if check_expr is not null then
      command := command || format(' with check (%s)', check_expr);
    end if;
    execute command;
  end loop;
end
$$;

-- Index foreign-key columns used by joins and parent-row delete/update checks.
create index if not exists idx_admin_audit_logs_actor_id on public.admin_audit_logs(actor_id);
create index if not exists idx_conversations_buyer_id on public.conversations(buyer_id);
create index if not exists idx_conversations_seller_id on public.conversations(seller_id);
create index if not exists idx_disputes_opened_by on public.disputes(opened_by);
create index if not exists idx_disputes_order_id on public.disputes(order_id);
create index if not exists idx_favorites_listing_id on public.favorites(listing_id);
create index if not exists idx_listing_images_listing_id on public.listing_images(listing_id);
create index if not exists idx_marketplace_settings_updated_by on public.marketplace_settings(updated_by);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_order_deliveries_buyer_id on public.order_deliveries(buyer_id);
create index if not exists idx_order_deliveries_seller_id on public.order_deliveries(seller_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_refunds_payment_id on public.refunds(payment_id);
create index if not exists idx_reports_conversation_id on public.reports(conversation_id);
create index if not exists idx_reports_listing_id on public.reports(listing_id);
create index if not exists idx_reports_reporter_id on public.reports(reporter_id);
create index if not exists idx_seller_payouts_seller_id on public.seller_payouts(seller_id);
create index if not exists idx_transaction_events_order_id on public.transaction_events(order_id);
create index if not exists idx_user_restrictions_restricted_by on public.user_restrictions(restricted_by);
