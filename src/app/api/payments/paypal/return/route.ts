import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getPaymentProvider } from '@/lib/payments/provider';

function orderUrl(orderId: string, result: string) {
  return new URL(`/orders/${orderId}?paypal=${result}`, process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id') ?? '';
  const paypalOrderId = url.searchParams.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[A-Z0-9]{10,64}$/.test(paypalOrderId)) {
    return NextResponse.redirect(new URL('/orders?error=paypal', url.origin));
  }

  const db = await createClient();
  if (!db) return NextResponse.redirect(orderUrl(orderId, 'configuration'));
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`, url.origin));
  const [{ data: order }, { data: payment }] = await Promise.all([
    db.from('orders').select('id,buyer_id,status,subtotal_minor,currency').eq('id', orderId).maybeSingle(),
    db.from('payments').select('provider,status,provider_reference').eq('order_id', orderId).maybeSingle(),
  ]);
  if (!order || order.buyer_id !== user.id || !payment || payment.provider !== 'paypal' || payment.provider_reference !== paypalOrderId) {
    return NextResponse.redirect(orderUrl(orderId, 'mismatch'));
  }
  if (payment.status === 'succeeded') return NextResponse.redirect(orderUrl(orderId, 'paid'));

  const provider = getPaymentProvider();
  const serviceDb = createServiceClient();
  if (!provider || !serviceDb) return NextResponse.redirect(orderUrl(orderId, 'configuration'));
  try {
    const capture = await provider.captureCheckout(paypalOrderId);
    if (capture.amountMinor !== order.subtotal_minor || capture.currency.toUpperCase() !== order.currency.trim().toUpperCase()) {
      return NextResponse.redirect(orderUrl(orderId, 'mismatch'));
    }
    const { error } = await serviceDb.rpc('process_paypal_capture', {
      p_paypal_order_id: paypalOrderId,
      p_capture_id: capture.captureReference,
      p_amount_minor: capture.amountMinor,
      p_currency: capture.currency,
      p_event_id: `capture:${capture.captureReference}`,
      p_source: 'capture_api',
    });
    if (error) return NextResponse.redirect(orderUrl(orderId, 'pending'));
    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    return NextResponse.redirect(orderUrl(orderId, 'paid'));
  } catch {
    return NextResponse.redirect(orderUrl(orderId, 'pending'));
  }
}
