import 'server-only';
import type { CheckoutRequest, PaymentProvider, VerifiedPaymentEvent } from './provider';

type PayPalLink = { rel?: string; href?: string };
type PayPalOrder = {
  id?: string;
  status?: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }> };
  }>;
};
type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function apiBase() {
  return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function readConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!clientId || !clientSecret || !webhookId) throw new Error('PayPal server configuration is incomplete.');
  return { clientId, clientSecret, webhookId };
}

async function accessToken() {
  const { clientId, clientSecret } = readConfig();
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error('PayPal did not return an access token.');
  return result.access_token;
}

async function paypalRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`PayPal request failed (${response.status}).`);
  return await response.json() as T;
}

function amountToMinor(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

function eventFromPayload(event: JsonObject): VerifiedPaymentEvent | null {
  const eventId = typeof event.id === 'string' ? event.id : '';
  const resource = asObject(event.resource);
  if (!eventId || !resource) return null;
  if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
    return { eventId, kind: 'ignored' };
  }
  const supplementary = asObject(resource.supplementary_data);
  const relatedIds = asObject(supplementary?.related_ids);
  const amount = asObject(resource.amount);
  const providerReference = relatedIds?.order_id;
  const captureReference = resource.id;
  const amountMinor = amountToMinor(typeof amount?.value === 'string' ? amount.value : undefined);
  const currency = amount?.currency_code;
  if (typeof providerReference !== 'string' || typeof captureReference !== 'string' || amountMinor === null || typeof currency !== 'string') return null;
  return { eventId, providerReference, captureReference, kind: 'succeeded', amountMinor, currency };
}

export const paypalProvider: PaymentProvider = {
  id: 'paypal',

  async createCheckout(request: CheckoutRequest) {
    const result = await paypalRequest<PayPalOrder>('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': request.idempotencyKey },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: request.orderId,
          invoice_id: request.orderId,
          amount: { currency_code: request.currency, value: (request.amountMinor / 100).toFixed(2) },
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Ownly',
              return_url: request.returnUrl,
              cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/orders/${request.orderId}?paypal=cancelled`,
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
            },
          },
        },
      }),
    });
    const approveUrl = result.links?.find((link) => link.rel === 'approve' || link.rel === 'payer-action')?.href;
    if (!result.id || !approveUrl) throw new Error('PayPal did not return an approval link.');
    return { checkoutUrl: approveUrl, providerReference: result.id };
  },

  async captureCheckout(providerReference: string) {
    if (!/^[A-Z0-9]{10,64}$/.test(providerReference)) throw new Error('Invalid PayPal order reference.');
    const result = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${providerReference}/capture`, {
      method: 'POST', headers: { 'PayPal-Request-Id': `capture-${providerReference}` }, body: '{}',
    });
    const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    const amountMinor = amountToMinor(capture?.amount?.value);
    const currency = capture?.amount?.currency_code;
    if (result.id !== providerReference || result.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' || !capture.id || amountMinor === null || !currency) {
      throw new Error('PayPal has not completed this payment.');
    }
    return { captureReference: capture.id, amountMinor, currency };
  },

  async verifyWebhook(rawBody: string, headers: Headers) {
    let event: JsonObject;
    try {
      const parsed = asObject(JSON.parse(rawBody) as unknown);
      if (!parsed) return null;
      event = parsed;
    } catch { return null; }
    const { webhookId } = readConfig();
    const verification = await paypalRequest<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: headers.get('paypal-auth-algo'),
        cert_url: headers.get('paypal-cert-url'),
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        transmission_time: headers.get('paypal-transmission-time'),
        webhook_id: webhookId,
        webhook_event: event,
      }),
    });
    if (verification.verification_status !== 'SUCCESS') return null;
    return eventFromPayload(event);
  },
};
