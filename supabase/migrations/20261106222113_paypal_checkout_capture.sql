-- PayPal capture state is written only by trusted server code. The service role
-- is used after the return handler verifies the capture with PayPal or after
-- the webhook signature is verified with PayPal.
alter table public.payments
  add column if not exists provider_capture_reference text unique;

create or replace function public.attach_paypal_order(
  p_order_id uuid,
  p_paypal_order_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  payment_row public.payments%rowtype;
  paypal_id text := trim(coalesce(p_paypal_order_id, ''));
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if paypal_id !~ '^[A-Z0-9]{10,64}$' then
    raise exception 'invalid PayPal order reference' using errcode = '22023';
  end if;
  select * into order_row from public.orders where id = p_order_id and buyer_id = auth.uid() for update;
  if not found or order_row.status <> 'pending_payment' then
    raise exception 'pending buyer order required' using errcode = '42501';
  end if;
  select * into payment_row from public.payments where order_id = p_order_id for update;
  if not found or payment_row.status <> 'pending' then
    raise exception 'pending payment required' using errcode = '22023';
  end if;
  if payment_row.provider_reference is not null and payment_row.provider_reference <> paypal_id then
    raise exception 'a different PayPal order is already linked' using errcode = '23505';
  end if;
  update public.payments set provider = 'paypal', provider_reference = paypal_id where order_id = p_order_id;
end;
$$;
revoke all on function public.attach_paypal_order(uuid, text) from public, anon;
grant execute on function public.attach_paypal_order(uuid, text) to authenticated;

create or replace function public.process_paypal_capture(
  p_paypal_order_id text,
  p_capture_id text,
  p_amount_minor bigint,
  p_currency text,
  p_event_id text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  order_row public.orders%rowtype;
  paypal_id text := trim(coalesce(p_paypal_order_id, ''));
  capture_id text := trim(coalesce(p_capture_id, ''));
  event_id text := trim(coalesce(p_event_id, ''));
  currency_code text := upper(trim(coalesce(p_currency, '')));
begin
  if auth.role() <> 'service_role' then
    raise exception 'trusted payment processor access required' using errcode = '42501';
  end if;
  if paypal_id !~ '^[A-Z0-9]{10,64}$' or length(capture_id) not between 3 and 128
     or length(event_id) not between 3 and 255 or p_amount_minor < 0
     or currency_code !~ '^[A-Z]{3}$' or p_source not in ('capture_api', 'webhook') then
    raise exception 'invalid PayPal capture data' using errcode = '22023';
  end if;

  if exists (select 1 from public.transaction_events where provider_event_id = event_id) then
    return (select order_id from public.payments where provider_reference = paypal_id);
  end if;

  select * into payment_row from public.payments where provider_reference = paypal_id for update;
  if not found or payment_row.provider <> 'paypal' then
    raise exception 'PayPal order reference not found' using errcode = 'P0002';
  end if;
  select * into order_row from public.orders where id = payment_row.order_id for update;
  if order_row.status <> 'pending_payment' or payment_row.status <> 'pending' then
    if payment_row.status = 'succeeded' and payment_row.provider_capture_reference = capture_id then
      insert into public.transaction_events(order_id, event_type, provider_event_id, payload)
        values(order_row.id, 'paypal_capture_duplicate', event_id,
          jsonb_build_object('paypal_order_id', paypal_id, 'capture_id', capture_id, 'source', p_source))
        on conflict (provider_event_id) do nothing;
      return order_row.id;
    end if;
    raise exception 'order is not awaiting PayPal payment' using errcode = '22023';
  end if;
  if p_amount_minor <> order_row.subtotal_minor or currency_code <> upper(order_row.currency::text) then
    raise exception 'PayPal amount or currency does not match the order' using errcode = '22023';
  end if;

  update public.payments set status = 'succeeded', provider_capture_reference = capture_id where id = payment_row.id;
  update public.orders set status = 'paid', delivery_status = 'awaiting_delivery' where id = order_row.id;
  insert into public.transaction_events(order_id, event_type, provider_event_id, payload)
    values(order_row.id, 'paypal_capture_succeeded', event_id,
      jsonb_build_object('paypal_order_id', paypal_id, 'capture_id', capture_id,
        'amount_minor', p_amount_minor, 'currency', currency_code, 'source', p_source));
  return order_row.id;
end;
$$;
revoke all on function public.process_paypal_capture(text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.process_paypal_capture(text, text, bigint, text, text, text) to service_role;

create or replace function public.create_order(p_listing_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); item public.listings%rowtype; new_order_id uuid; fee_bps integer; fee_minor bigint;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if public.is_restricted() then raise exception 'restricted accounts cannot place orders' using errcode = '42501'; end if;
  select * into item from public.listings where id = p_listing_id for update;
  if not found or item.status <> 'active' then raise exception 'listing is unavailable' using errcode = 'P0002'; end if;
  if item.transaction_mode <> 'ON_SITE' or not exists (
    select 1 from public.categories c where c.id = item.category_id and c.active and 'ON_SITE' = any(c.allowed_modes)
  ) then raise exception 'on-site checkout is not enabled for this listing' using errcode = '22023'; end if;
  if item.seller_id = actor then raise exception 'you cannot buy your own listing' using errcode = '22023'; end if;
  if exists (select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
      where oi.listing_id = p_listing_id and o.status in ('pending_payment','paid','processing','disputed')) then
    raise exception 'an order is already in progress for this listing' using errcode = '23505';
  end if;
  select value_integer into fee_bps from public.marketplace_settings where setting_key = 'commission_bps';
  fee_bps := coalesce(fee_bps, 500);
  fee_minor := floor((item.price_minor::numeric * fee_bps + 5000) / 10000)::bigint;
  insert into public.orders(buyer_id,seller_id,status,currency,subtotal_minor,commission_bps,commission_minor,seller_net_minor,delivery_status)
  values(actor,item.seller_id,'pending_payment',item.currency,item.price_minor,fee_bps,fee_minor,item.price_minor-fee_minor,'pending_payment')
  returning id into new_order_id;
  insert into public.order_items(order_id,listing_id,title_snapshot,price_minor,currency,terms_snapshot)
  values(new_order_id,item.id,item.title,item.price_minor,item.currency,jsonb_build_object('description',item.description,'created_at',item.created_at));
  insert into public.payments(order_id,status,provider) values(new_order_id,'pending','paypal');
  insert into public.transaction_events(order_id,event_type,payload)
  values(new_order_id,'order_created',jsonb_build_object('payment_provider','paypal','commission_bps',fee_bps));
  return new_order_id;
end;
$$;
revoke all on function public.create_order(uuid) from public, anon;
grant execute on function public.create_order(uuid) to authenticated;

create or replace function public.cancel_pending_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare item public.orders%rowtype; payment_row public.payments%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into item from public.orders where id=p_order_id for update;
  if not found or item.buyer_id <> auth.uid() then raise exception 'buyer access required' using errcode = '42501'; end if;
  if item.status <> 'pending_payment' then raise exception 'only unpaid orders may be cancelled' using errcode = '22023'; end if;
  select * into payment_row from public.payments where order_id=p_order_id for update;
  if payment_row.provider = 'paypal' and payment_row.provider_reference is not null then
    raise exception 'cancel PayPal checkout before cancelling this order' using errcode = '22023';
  end if;
  update public.orders set status='cancelled',delivery_status='cancelled' where id=item.id;
  insert into public.transaction_events(order_id,event_type) values(item.id,'buyer_cancelled_unpaid_order');
end;
$$;
revoke all on function public.cancel_pending_order(uuid) from public, anon;
grant execute on function public.cancel_pending_order(uuid) to authenticated;
