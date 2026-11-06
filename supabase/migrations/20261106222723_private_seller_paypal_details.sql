-- Seller PayPal destinations are private payout data and must never be exposed
-- through the public profile table or public profile pages.
create table if not exists public.seller_payment_details (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  paypal_email text not null check (
    length(trim(paypal_email)) between 3 and 254
    and paypal_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  updated_at timestamptz not null default now()
);

alter table public.seller_payment_details enable row level security;
revoke all on public.seller_payment_details from anon, authenticated;
grant select, insert, update, delete on public.seller_payment_details to authenticated;

drop policy if exists "Seller reads own PayPal destination" on public.seller_payment_details;
create policy "Seller reads own PayPal destination"
  on public.seller_payment_details for select to authenticated
  using (seller_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Seller manages own PayPal destination" on public.seller_payment_details;
create policy "Seller manages own PayPal destination"
  on public.seller_payment_details for all to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));
