# Ownly

Ownly is a Next.js marketplace foundation for eligible digital properties. It uses Supabase for PostgreSQL, Row Level Security, Auth and (future) Storage. Direct inquiries are enabled; on-site purchases are disabled in application and database policy.

## Local setup

1. Install Node.js 20+ and create a Supabase project.
2. Copy `.env.example` to `.env.local`, then set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Apply `supabase/migrations/202611010001_initial.sql` in the Supabase SQL editor or with the Supabase CLI.
4. In Supabase Auth, enable email confirmation and set the site URL plus `/auth/callback` redirect URL.
5. Run `npm install`, then `npm run dev`.

Never put a Supabase service-role key in a `NEXT_PUBLIC_` variable. Create the first staff role through a trusted SQL session, for example `insert into public.user_roles(user_id,role) values ('AUTH_USER_UUID','admin');`. Do not expose that operation to users. Supabase's email provider/password policy and outbound mail need configuration for account verification and recovery.

## What is implemented

- Responsive public homepage, category exploration, full-text listing search, price filters, sorting and URL query state.
- Supabase Auth signup/login/email confirmation callback and session cookie integration.
- Server-side listing submission, category policy validation, moderation queue, favorites, seller profiles and private inquiries.
- RLS for profiles, listings, favorites, inquiries, messages, reports and transaction records. Listing policy trigger prevents self-publication and category/mode bypass.
- PostgreSQL schema for category attributes, moderation, reports, audit records, orders, payments, refunds/disputes records and transaction events.
- Optional PayPal checkout charges the full amount to Ownly; completed orders enter a manual seller payout queue. Checkout stays disabled until PayPal approval and production configuration are complete. See [payment status and launch requirements](docs/PAYMENTS.md).
- Metadata, listing metadata, sitemap and robots route.

## Not enabled / operational work

- PayPal checkout is disabled by default. Seller payouts are manual; refunds and disputes require manual handling. Ownly does not provide escrow or buyer protection. Confirm PayPal approval for the marketplace model and operating jurisdiction before enabling live payments.
- Supabase credentials are required for all persistent workflows. No demo listings or fabricated transaction records are seeded.
- Listing image upload/storage, image moderation/scanning, profile editing, password reset form, block controls, message read receipts, category administration UI, complete admin analytics, and distributed rate limiting need implementation/configuration. The schema supports image records and category attribute definitions, but the current listing composer intentionally accepts text only.
- Configure a production email provider, CAPTCHA/abuse controls and rate limits for signup/report creation, backups, monitoring, retention rules, legal policies and incident response before launch. Inquiry messages are limited at the database to eight per sender per minute.
- Staff role assignment is intentionally out-of-band. Keep the first admin bootstrap in trusted SQL/service operations.

## Security notes

Public routes use only the Supabase anon key and session cookies. The service-role key is not used. Listing creation re-reads authenticated identity and category policy server-side; RLS and a database trigger enforce owner, moderation state and allowed transaction mode. Conversations are readable only by participants under RLS. Reports and admin actions are authenticated; audit insertion requires a staff role. Do not add collection of account credentials or recovery codes.

## Checks

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. These require dependencies installed; integration/RLS behavior additionally requires a configured Supabase project and should be verified before deployment.
