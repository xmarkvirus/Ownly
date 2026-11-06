import { paypalProvider } from './paypal';

export type CheckoutRequest = {
  orderId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  returnUrl: string;
};

export type VerifiedPaymentEvent =
  | { eventId: string; kind: 'ignored' }
  | { eventId: string; providerReference: string; captureReference: string; kind: 'succeeded'; amountMinor: number; currency: string };

/** Provider implementations must verify the raw webhook signature before returning an event. */
export interface PaymentProvider {
  readonly id: string;
  createCheckout(request: CheckoutRequest): Promise<{ checkoutUrl: string; providerReference: string }>;
  captureCheckout(providerReference: string): Promise<{ captureReference: string; amountMinor: number; currency: string }>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent | null>;
}

/** No provider is selected until server-only credentials and explicit feature flags are set. */
export function getPaymentProvider(): PaymentProvider | null {
  if (process.env.PAYPAL_CHECKOUT_ENABLED !== 'true' || process.env.ON_SITE_PURCHASES_ENABLED !== 'true') return null;
  if (process.env.PAYPAL_ENV === 'live' && process.env.PAYPAL_LIVE_PAYMENTS_APPROVED !== 'true') return null;
  if (!process.env.PAYPAL_CLIENT_ID?.trim() || !process.env.PAYPAL_CLIENT_SECRET?.trim() || !process.env.PAYPAL_WEBHOOK_ID?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  return paypalProvider;
}

export function isPaypalCheckoutEnabled(): boolean {
  return getPaymentProvider()?.id === 'paypal';
}
