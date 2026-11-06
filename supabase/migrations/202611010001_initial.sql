create extension if not exists pgcrypto;
create type public.listing_status as enum ('draft','pending_review','active','paused','unavailable','rejected','removed','archived');
create type public.transaction_mode as enum ('DIRECT','ON_SITE','DISABLED');
create type public.order_status as enum ('pending_payment','paid','processing','completed','cancelled','refunded','disputed');
create type public.payment_status as enum ('pending','succeeded','failed','refunded','partially_refunded');

create table public.profiles(id uuid primary key references auth.users on delete cascade, display_name text not null default 'Member', avatar_path text, bio text not null default '', created_at timestamptz not null default now());
create table public.user_restrictions(user_id uuid primary key references public.profiles on delete cascade, reason text not null, restricted_at timestamptz not null default now(), restricted_by uuid references public.profiles);
create table public.categories(id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, description text not null default '', active boolean not null default true, allowed_modes public.transaction_mode[] not null default array['DIRECT']::public.transaction_mode[], created_at timestamptz not null default now());
create table public.category_attributes(id uuid primary key default gen_random_uuid(), category_id uuid not null references public.categories on delete cascade, key text not null, label text not null, value_type text not null check(value_type in ('text','number','boolean','select')), options jsonb not null default '[]', required boolean not null default false, unique(category_id,key));
create table public.listings(id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles on delete restrict, category_id uuid not null references public.categories on delete restrict, title text not null check(length(title) between 8 and 100), description text not null check(length(description) between 30 and 5000), price_minor bigint not null check(price_minor between 0 and 100000000), currency char(3) not null check(currency ~ '^[A-Z]{3}$'), transaction_mode public.transaction_mode not null default 'DIRECT', seller_authorized boolean not null default false check(seller_authorized), rules_accepted boolean not null default false check(rules_accepted), attributes jsonb not null default '{}', status public.listing_status not null default 'pending_review', moderation_note text, published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.listings add column search_document tsvector generated always as (to_tsvector('english',title || ' ' || description)) stored;
create index listings_search_idx on public.listings using gin(search_document);
create index listings_active_category_price_idx on public.listings(category_id,price_minor) where status='active';
create index listings_seller_status_idx on public.listings(seller_id,status);
create table public.listing_images(id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.listings on delete cascade,storage_path text not null unique,alt_text text not null default '',position smallint not null default 0);
create table public.favorites(user_id uuid not null references public.profiles on delete cascade,listing_id uuid not null references public.listings on delete cascade,created_at timestamptz not null default now(),primary key(user_id,listing_id));
create table public.conversations(id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.listings on delete cascade,buyer_id uuid not null references public.profiles on delete cascade,seller_id uuid not null references public.profiles on delete cascade,created_at timestamptz not null default now(),unique(listing_id,buyer_id),check(buyer_id<>seller_id));
create table public.messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations on delete cascade,sender_id uuid not null references public.profiles on delete cascade,body text not null check(length(body) between 1 and 4000),created_at timestamptz not null default now(),read_at timestamptz);
create index messages_sender_created_idx on public.messages(sender_id,created_at desc);
create table public.reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles on delete cascade,listing_id uuid references public.listings on delete cascade,conversation_id uuid references public.conversations on delete cascade,reason text not null check(length(reason) between 10 and 2000),status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),created_at timestamptz not null default now(),check(num_nonnulls(listing_id,conversation_id)=1));
create table public.user_roles(user_id uuid primary key references public.profiles on delete cascade,role text not null check(role in ('admin','moderator')));
create table public.orders(id uuid primary key default gen_random_uuid(),buyer_id uuid not null references public.profiles,seller_id uuid not null references public.profiles,status public.order_status not null default 'pending_payment',currency char(3) not null,subtotal_minor bigint not null check(subtotal_minor>=0),created_at timestamptz not null default now());
create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders on delete restrict,listing_id uuid references public.listings on delete set null,title_snapshot text not null,price_minor bigint not null,currency char(3) not null,terms_snapshot jsonb not null default '{}');
create table public.payments(id uuid primary key default gen_random_uuid(),order_id uuid not null unique references public.orders on delete restrict,status public.payment_status not null default 'pending',provider text not null,provider_reference text unique,created_at timestamptz not null default now());
create table public.refunds(id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.payments on delete restrict,amount_minor bigint not null check(amount_minor>0),provider_reference text unique,status text not null,created_at timestamptz not null default now());
create table public.disputes(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders on delete restrict,opened_by uuid not null references public.profiles,reason text not null,status text not null default 'open',created_at timestamptz not null default now());
create table public.transaction_events(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders on delete restrict,event_type text not null,provider_event_id text unique,payload jsonb not null default '{}',created_at timestamptz not null default now());
create table public.admin_audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles,action text not null,target_type text not null,target_id uuid,reason text not null,metadata jsonb not null default '{}',created_at timestamptz not null default now());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'Member')) on conflict(id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create or replace function public.protect_profile_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin if not public.is_staff() and (new.id is distinct from old.id or new.created_at is distinct from old.created_at) then raise exception 'protected profile field'; end if; return new; end $$;
create trigger profile_field_guard before update on public.profiles for each row execute function public.protect_profile_fields();

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=auth.uid()) $$;
create or replace function public.is_restricted() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_restrictions where user_id=auth.uid()) $$;
alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.category_attributes enable row level security; alter table public.listings enable row level security; alter table public.listing_images enable row level security; alter table public.favorites enable row level security; alter table public.conversations enable row level security; alter table public.messages enable row level security; alter table public.reports enable row level security; alter table public.user_roles enable row level security; alter table public.orders enable row level security; alter table public.order_items enable row level security; alter table public.payments enable row level security; alter table public.refunds enable row level security; alter table public.disputes enable row level security; alter table public.transaction_events enable row level security; alter table public.admin_audit_logs enable row level security;
alter table public.user_restrictions enable row level security;
create policy "Public profiles" on public.profiles for select using (true); create policy "Own profile update" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid()); create policy "Staff read restrictions" on public.user_restrictions for select using(public.is_staff()); create policy "Staff manage restrictions" on public.user_restrictions for all using(public.is_staff()) with check(public.is_staff());
create policy "Active categories" on public.categories for select using(active or public.is_staff()); create policy "Active category fields" on public.category_attributes for select using(exists(select 1 from public.categories c where c.id=category_id and c.active) or public.is_staff());
create policy "Published listings" on public.listings for select using(status='active' or seller_id=auth.uid() or public.is_staff()); create policy "Seller create listing" on public.listings for insert with check(seller_id=auth.uid() and not public.is_restricted()); create policy "Seller edit listing" on public.listings for update using(seller_id=auth.uid() or public.is_staff()) with check(seller_id=auth.uid() or public.is_staff());
create policy "Listing images visible" on public.listing_images for select using(exists(select 1 from public.listings l where l.id=listing_id and (l.status='active' or l.seller_id=auth.uid() or public.is_staff()))); create policy "Seller image manage" on public.listing_images for all using(exists(select 1 from public.listings l where l.id=listing_id and l.seller_id=auth.uid()));
create policy "Own favorites" on public.favorites for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Conversation participants" on public.conversations for select using(buyer_id=auth.uid() or seller_id=auth.uid() or public.is_staff()); create policy "Buyer starts conversation" on public.conversations for insert with check(buyer_id=auth.uid() and exists(select 1 from public.listings l where l.id=listing_id and l.status='active' and l.seller_id=seller_id));
create policy "Participant messages" on public.messages for select using(exists(select 1 from public.conversations c where c.id=conversation_id and (c.buyer_id=auth.uid() or c.seller_id=auth.uid())) or public.is_staff()); create policy "Participant sends message" on public.messages for insert with check(sender_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and (c.buyer_id=auth.uid() or c.seller_id=auth.uid())));
create policy "Reporter own reports" on public.reports for select using(reporter_id=auth.uid() or public.is_staff()); create policy "Authenticated report" on public.reports for insert with check(reporter_id=auth.uid());
create policy "Read own role" on public.user_roles for select using(user_id=auth.uid());
create policy "Order participants" on public.orders for select using(buyer_id=auth.uid() or seller_id=auth.uid() or public.is_staff()); create policy "Order items participants" on public.order_items for select using(exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid() or public.is_staff())));
create policy "Payment participant read" on public.payments for select using(exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid() or public.is_staff())));
create policy "Refund staff read" on public.refunds for select using(public.is_staff()); create policy "Dispute participants" on public.disputes for select using(opened_by=auth.uid() or public.is_staff()); create policy "Transaction event participants" on public.transaction_events for select using(exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid() or public.is_staff()))); create policy "Audit staff read" on public.admin_audit_logs for select using(public.is_staff()); create policy "Staff audit insert" on public.admin_audit_logs for insert with check(actor_id=auth.uid() and public.is_staff()); create policy "Own profile insert" on public.profiles for insert with check(id=auth.uid());
create or replace function public.enforce_listing_policy() returns trigger language plpgsql security definer set search_path=public as $$
declare modes public.transaction_mode[]; listing_changed boolean;
begin
  if tg_op='INSERT' then
    if new.seller_id <> auth.uid() and not public.is_staff() then raise exception 'invalid listing owner'; end if;
    select allowed_modes into modes from public.categories where id=new.category_id and active=true;
    if modes is null or not (new.transaction_mode=any(modes)) or new.transaction_mode='DISABLED' then raise exception 'category does not permit this transaction mode'; end if;
    if new.transaction_mode='ON_SITE' then raise exception 'on-site purchases are disabled'; end if;
    new.status='pending_review'; new.moderation_note=null; new.published_at=null;
  else
    if new.seller_id<>old.seller_id and not public.is_staff() then raise exception 'listing owner is immutable'; end if;
    listing_changed := new.title is distinct from old.title or new.description is distinct from old.description or new.price_minor is distinct from old.price_minor or new.category_id is distinct from old.category_id or new.transaction_mode is distinct from old.transaction_mode or new.attributes is distinct from old.attributes;
    if not public.is_staff() and (new.moderation_note is distinct from old.moderation_note or new.published_at is distinct from old.published_at) then raise exception 'moderation fields are staff managed'; end if;
    if not public.is_staff() and new.status is distinct from old.status then
      if not ((old.status='active' and new.status in ('paused','unavailable')) or (old.status='paused' and new.status in ('active','unavailable')) or (old.status='unavailable' and new.status='archived')) then raise exception 'invalid listing transition'; end if;
    end if;
    if listing_changed then
      select allowed_modes into modes from public.categories where id=new.category_id and active=true;
      if modes is null or not (new.transaction_mode=any(modes)) or new.transaction_mode='DISABLED' then raise exception 'category does not permit this transaction mode'; end if;
      if new.transaction_mode='ON_SITE' then raise exception 'on-site purchases are disabled'; end if;
      if not public.is_staff() then new.status='pending_review'; end if;
    end if;
  end if;
  new.updated_at=now(); return new;
end $$;
create trigger listing_policy_gate before insert or update on public.listings for each row execute function public.enforce_listing_policy();
create or replace function public.rate_limit_message() returns trigger language plpgsql security definer set search_path=public as $$
declare recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.sender_id::text,0));
  select count(*) into recent_count from public.messages where sender_id=new.sender_id and created_at>now()-interval '1 minute';
  if recent_count>=8 then raise exception 'message rate limit exceeded'; end if;
  return new;
end $$;
create trigger message_rate_gate before insert on public.messages for each row execute function public.rate_limit_message();
insert into public.categories(slug,name,description,allowed_modes) values ('gaming','Gaming accounts','Gaming properties where transfer is permitted.','{DIRECT}'),('social','Social media accounts','Social profiles, subject to each platform''s transfer rules.','{DIRECT}'),('youtube','YouTube channels','Channels, subject to applicable platform terms.','{DIRECT}'),('websites','Websites & digital properties','Web properties, domains and digital businesses.','{DIRECT}'),('other','Other digital assets','Other permitted assets reviewed by Ownly.','{DIRECT}') on conflict(slug) do nothing;
