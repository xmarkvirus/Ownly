# Payment integration status

Ownly supports a PayPal checkout flow that charges the buyer the full order amount to Ownly. After delivery is confirmed, an administrator sends the seller's net payout manually through PayPal and records the PayPal transaction reference in the admin payout queue. The app does not send seller payouts automatically.

Checkout is disabled by default. `PAYPAL_CHECKOUT_ENABLED` and `ON_SITE_PURCHASES_ENABLED` must both be set to `true`, and server-only PayPal and Supabase credentials must be configured. Listings must also use the on-site transaction mode and belong to an eligible category. Live checkout additionally requires `PAYPAL_LIVE_PAYMENTS_APPROVED=true` as an explicit operator gate.

Before enabling live payments, confirm with PayPal that Ownly's account and country are approved to collect the full payment for marketplace sales and pay sellers afterward. Keep checkout disabled until that is confirmed. Sandbox and live credentials must be kept separate, and secrets must only be configured in the deployment provider's server environment; never add them to `NEXT_PUBLIC_` variables or commit them.

The return route captures the PayPal order server-side and checks the captured amount and currency against the order. The webhook route verifies PayPal's signature and processes completed captures idempotently through a service-only database function. Browser redirects alone cannot mark an order paid.

Refunds, disputes, chargeback handling, automatic seller payouts, payout reconciliation, and buyer-protection operations are not automated. They require manual operational handling until those workflows are implemented. Do not describe Ownly payments as escrow or buyer protection.
