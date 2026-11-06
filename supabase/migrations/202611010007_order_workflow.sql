-- Provider-independent order records. No payment provider is configured here.
create table if not exists public.marketplace_settings (
  setting_key text primary key,
  value_integer integer not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint marketplace_settings_commission_range check (value_integer between 0 and 2500)
);
insert into public.marketplace_settings(setting_key, value_integer)
values ('commission_bps', 500) on conflict (setting_key) do nothing;
alter table public.marketplace_settings enable row level security;
drop policy if exists "Admins read marketplace settings" on public.marketplace_settings;
create policy "Admins read marketplace settings" on public.marketplace_settings for select to authenticated using (public.is_admin());
revoke all on public.marketplace_settings from anon, authenticated;
grant select on public.marketplace_settings to authenticated;

alter table public.orders add column if not exists commission_bps integer;
alter table public.orders add column if not exists commission_minor bigint;
alter table public.orders add column if not exists seller_net_minor bigint;
alter table public.orders add column if not exists delivery_status text;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists confirmed_at timestamptz;
update public.orders set delivery_status = case
  when status = 'completed' then 'completed'
  when status = 'disputed' then 'disputed'
  when status = 'processing' then 'awaiting_delivery'
  when status = 'paid' then 'awaiting_delivery'
  when status = 'cancelled' then 'cancelled'
  when status = 'refunded' then 'refunded'
  else 'pending_payment'
end where delivery_status is null;
alter table public.orders alter column delivery_status set default 'pending_payment';
alter table public.orders alter column delivery_status set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_status_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_delivery_status_check check (delivery_status in ('pending_payment','awaiting_delivery','awaiting_confirmation','completed','cancelled','refunded','disputed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_commission_snapshot_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_commission_snapshot_check check (
      (commission_bps is null and commission_minor is null and seller_net_minor is null)
      or (commission_bps between 0 and 2500 and commission_minor >= 0 and seller_net_minor >= 0 and commission_minor + seller_net_minor = subtotal_minor)
    );
  end if;
end $$;

create table if not exists public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  seller_id uuid not null references public.profiles(id),
  buyer_id uuid not null references public.profiles(id),
  delivery_content text not null check (length(delivery_content) between 1 and 10000),
  created_at timestamptz not null default now()
);
alter table public.order_deliveries enable row level security;
drop policy if exists "Order participants read delivery" on public.order_deliveries;
create policy "Order participants read delivery" on public.order_deliveries for select to authenticated using (
  seller_id = auth.uid() or (buyer_id = auth.uid() and exists (
    select 1 from public.orders o where o.id = order_id and o.delivery_status in ('awaiting_confirmation','completed','disputed','refunded')
  ))
);
revoke all on public.order_deliveries from anon, authenticated;
grant select on public.order_deliveries to authenticated;

-- Payout eligibility is tracked separately from the order lifecycle. This is
-- only a record; Ownly does not transfer or hold funds.
create table if not exists public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  seller_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('eligible','held','paid')),
  provider_reference text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.seller_payouts enable row level security;
drop policy if exists "Seller and admin read payout records" on public.seller_payouts;
create policy "Seller and admin read payout records" on public.seller_payouts for select to authenticated using (seller_id = auth.uid() or public.is_admin());
revoke all on public.seller_payouts from anon, authenticated;
grant select on public.seller_payouts to authenticated;

create index if not exists orders_buyer_created_idx on public.orders(buyer_id, created_at desc);
create index if not exists orders_seller_created_idx on public.orders(seller_id, created_at desc);
create index if not exists order_items_listing_order_idx on public.order_items(listing_id, order_id);

grant select on public.orders, public.order_items, public.payments, public.refunds, public.disputes, public.transaction_events to authenticated;
revoke insert, update, delete on public.orders, public.order_items, public.payments, public.refunds, public.disputes, public.transaction_events from anon, authenticated;

create or replace function public.create_order(p_listing_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); item public.listings%rowtype; new_order_id uuid; fee_bps integer; fee_minor bigint;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if public.is_restricted() then raise exception 'restricted accounts cannot place orders' using errcode = '42501'; end if;
  select * into item from public.listings where id = p_listing_id for update;
  if not found or item.status <> 'active' then raise exception 'listing is unavailable' using errcode = 'P0002'; end if;
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
  -- Explicitly unconfigured: this is an order intent, not a payment attempt.
  insert into public.payments(order_id,status,provider) values(new_order_id,'pending','unconfigured');
  insert into public.transaction_events(order_id,event_type,payload)
  values(new_order_id,'order_created',jsonb_build_object('payment_provider','unconfigured','commission_bps',fee_bps));
  return new_order_id;
end;
$$;
revoke all on function public.create_order(uuid) from public, anon;
grant execute on function public.create_order(uuid) to authenticated;

create or replace function public.deliver_order(p_order_id uuid, p_delivery_content text)
returns void language plpgsql security definer set search_path = public as $$
declare item public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into item from public.orders where id = p_order_id for update;
  if not found or item.seller_id <> auth.uid() then raise exception 'seller access required' using errcode = '42501'; end if;
  if item.status <> 'paid' or item.delivery_status <> 'awaiting_delivery' then raise exception 'order is not ready for delivery' using errcode = '22023'; end if;
  if length(trim(coalesce(p_delivery_content,''))) not between 1 and 10000 then raise exception 'delivery details are required' using errcode = '22023'; end if;
  insert into public.order_deliveries(order_id,seller_id,buyer_id,delivery_content) values(item.id,item.seller_id,item.buyer_id,trim(p_delivery_content));
  update public.orders set status='processing',delivery_status='awaiting_confirmation',delivered_at=now() where id=item.id;
  insert into public.transaction_events(order_id,event_type) values(item.id,'seller_delivered');
end;
$$;
revoke all on function public.deliver_order(uuid,text) from public, anon;
grant execute on function public.deliver_order(uuid,text) to authenticated;

create or replace function public.confirm_order_receipt(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare item public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into item from public.orders where id=p_order_id for update;
  if not found or item.buyer_id <> auth.uid() then raise exception 'buyer access required' using errcode = '42501'; end if;
  if item.delivery_status <> 'awaiting_confirmation' then raise exception 'order is not awaiting receipt confirmation' using errcode = '22023'; end if;
  if item.seller_net_minor is null then raise exception 'order has no commission snapshot and cannot create a payout eligibility record' using errcode = '22023'; end if;
  update public.orders set status='completed',delivery_status='completed',confirmed_at=now() where id=item.id;
  insert into public.seller_payouts(order_id,seller_id,amount_minor,currency,status)
  values(item.id,item.seller_id,item.seller_net_minor,item.currency,'eligible')
  on conflict(order_id) do nothing;
  insert into public.transaction_events(order_id,event_type) values(item.id,'buyer_confirmed_receipt');
end;
$$;
revoke all on function public.confirm_order_receipt(uuid) from public, anon;
grant execute on function public.confirm_order_receipt(uuid) to authenticated;

create or replace function public.open_order_dispute(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare item public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into item from public.orders where id=p_order_id for update;
  if not found or item.buyer_id <> auth.uid() then raise exception 'buyer access required' using errcode = '42501'; end if;
  if item.delivery_status not in ('awaiting_delivery','awaiting_confirmation') then raise exception 'order cannot be disputed in its current state' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'reason must be 10 to 2000 characters' using errcode = '22023'; end if;
  update public.orders set status='disputed',delivery_status='disputed' where id=item.id;
  update public.seller_payouts set status='held' where order_id=item.id and status='eligible';
  insert into public.disputes(order_id,opened_by,reason,status) values(item.id,item.buyer_id,trim(p_reason),'open');
  insert into public.transaction_events(order_id,event_type) values(item.id,'buyer_opened_dispute');
end;
$$;
revoke all on function public.open_order_dispute(uuid,text) from public, anon;
grant execute on function public.open_order_dispute(uuid,text) to authenticated;

create or replace function public.cancel_pending_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare item public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into item from public.orders where id=p_order_id for update;
  if not found or item.buyer_id <> auth.uid() then raise exception 'buyer access required' using errcode = '42501'; end if;
  if item.status <> 'pending_payment' then raise exception 'only unpaid orders may be cancelled' using errcode = '22023'; end if;
  update public.orders set status='cancelled',delivery_status='cancelled' where id=item.id;
  insert into public.transaction_events(order_id,event_type) values(item.id,'buyer_cancelled_unpaid_order');
end;
$$;
revoke all on function public.cancel_pending_order(uuid) from public, anon;
grant execute on function public.cancel_pending_order(uuid) to authenticated;

create or replace function public.admin_set_commission_rate(p_basis_points integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'administrator access required' using errcode = '42501'; end if;
  if p_basis_points not between 0 and 2500 then raise exception 'commission must be between zero and twenty-five percent' using errcode = '22023'; end if;
  insert into public.marketplace_settings(setting_key,value_integer,updated_at,updated_by)
  values('commission_bps',p_basis_points,now(),auth.uid())
  on conflict(setting_key) do update set value_integer=excluded.value_integer,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into public.admin_audit_logs(actor_id,action,target_type,reason)
  values(auth.uid(),'commission_rate_changed','marketplace_setting',format('Commission rate changed to %s basis points',p_basis_points));
end;
$$;
revoke all on function public.admin_set_commission_rate(integer) from public, anon;
grant execute on function public.admin_set_commission_rate(integer) to authenticated;
