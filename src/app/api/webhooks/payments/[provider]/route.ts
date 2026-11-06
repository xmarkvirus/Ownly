import { getPaymentProvider } from '@/lib/payments/provider';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  const provider = getPaymentProvider();
  if (!provider || provider.id !== providerId) {
    return Response.json({ error: 'Payment provider is not configured.' }, { status: 503 });
  }
  const rawBody = await request.text();
  const event = await provider.verifyWebhook(rawBody, request.headers);
  if (!event) return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  if (event.kind === 'ignored') return Response.json({ received: true });
  const db = createServiceClient();
  if (!db) return Response.json({ error: 'Payment event processing is not configured.' }, { status: 503 });
  const { error } = await db.rpc('process_paypal_capture', {
    p_paypal_order_id: event.providerReference,
    p_capture_id: event.captureReference,
    p_amount_minor: event.amountMinor,
    p_currency: event.currency,
    p_event_id: event.eventId,
    p_source: 'webhook',
  });
  if (error) return Response.json({ error: 'Payment event could not be recorded.' }, { status: 500 });
  return Response.json({ received: true });
}
