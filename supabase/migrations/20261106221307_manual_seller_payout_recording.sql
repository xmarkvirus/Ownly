-- Record a seller payout only after the admin has sent it through PayPal.
-- This function does not transfer funds; it records and audits the external transfer.
create or replace function public.admin_mark_seller_payout_paid(
  p_payout_id uuid,
  p_provider_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payout public.seller_payouts%rowtype;
  order_row public.orders%rowtype;
  payment_row public.payments%rowtype;
  reference text := trim(coalesce(p_provider_reference, ''));
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if length(reference) not between 3 and 128 then
    raise exception 'a valid PayPal transaction reference is required' using errcode = '22023';
  end if;

  select * into payout from public.seller_payouts where id = p_payout_id for update;
  if not found then
    raise exception 'seller payout not found' using errcode = 'P0002';
  end if;
  if payout.status = 'paid' then
    if payout.provider_reference = reference then return; end if;
    raise exception 'seller payout was already recorded as paid' using errcode = '23505';
  end if;
  if payout.status <> 'eligible' then
    raise exception 'seller payout is not eligible' using errcode = '22023';
  end if;

  select * into order_row from public.orders where id = payout.order_id for update;
  select * into payment_row from public.payments where order_id = payout.order_id;
  if order_row.status <> 'completed' or order_row.delivery_status <> 'completed'
     or payment_row.id is null or payment_row.status <> 'succeeded' then
    raise exception 'order must be paid and completed before a seller payout' using errcode = '22023';
  end if;

  update public.seller_payouts
    set status = 'paid', provider_reference = reference, paid_at = now()
    where id = payout.id;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason)
    values(auth.uid(), 'seller_payout_marked_paid', 'seller_payout', payout.id,
      format('External PayPal transfer recorded: %s', reference));
  insert into public.transaction_events(order_id, event_type, payload)
    values(payout.order_id, 'seller_payout_marked_paid', jsonb_build_object('provider', 'paypal', 'reference', reference));
end;
$$;

revoke all on function public.admin_mark_seller_payout_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_seller_payout_paid(uuid, text) to authenticated;
