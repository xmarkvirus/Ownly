import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { createClient } from '@/lib/supabase/server';
import { formatMinorCurrency } from '@/lib/marketplace';
import { cancelPendingOrder, confirmOrderReceipt, deliverOrder, reportOrderProblem, retryPaypalCheckout } from '@/app/actions';
import { isPaypalCheckoutEnabled } from '@/lib/payments/provider';

export default async function OrderDetails({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; delivered?: string; completed?: string; disputed?: string; cancelled?: string; error?: string; paypal?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: order } = await db.from('orders').select('id,buyer_id,seller_id,status,currency,subtotal_minor,commission_bps,commission_minor,seller_net_minor,delivery_status,created_at').eq('id', id).maybeSingle();
  if (!order) notFound();
  const [{ data: items }, { data: payments }, { data: delivery }, { data: payout }] = await Promise.all([
    db.from('order_items').select('title_snapshot,price_minor,currency').eq('order_id', id),
    db.from('payments').select('status,provider,provider_reference,created_at').eq('order_id', id).maybeSingle(),
    db.from('order_deliveries').select('delivery_content,created_at').eq('order_id', id).maybeSingle(),
    db.from('seller_payouts').select('amount_minor,currency,status').eq('order_id', id).maybeSingle(),
  ]);
  const buyer = order.buyer_id === user.id;
  const seller = order.seller_id === user.id;
  const gross = formatMinorCurrency(order.subtotal_minor, order.currency);
  return <><SiteHeader/><main className="wrap page page-narrow"><div className="eyebrow">{buyer ? 'Your purchase' : 'Seller order'}</div><h1 className="page-title">Order {id.slice(0, 8).toUpperCase()}</h1>
    {query.created && <p className="alert alert-success" role="status">Order created. No payment was taken.</p>}
    {query.delivered && <p className="alert alert-success" role="status">Delivery submitted to the buyer.</p>}
    {query.completed && <p className="alert alert-success" role="status">Receipt confirmed. Seller payout eligibility was recorded.</p>}
    {query.disputed && <p className="alert alert-success" role="status">Your order issue was sent for review.</p>}
    {query.cancelled && <p className="alert alert-success" role="status">Unpaid order cancelled.</p>}
    {query.paypal === 'paid' && <p className="alert alert-success" role="status">PayPal confirmed your payment. The seller can now prepare delivery.</p>}
    {query.paypal === 'cancelled' && <p className="alert alert-warning" role="status">PayPal checkout was cancelled. No payment was confirmed.</p>}
    {query.paypal === 'pending' && <p className="alert alert-warning" role="status">PayPal is still confirming the payment. Refresh shortly; do not pay again yet.</p>}
    {query.paypal === 'mismatch' && <p className="alert alert-error" role="alert">PayPalâ€™s payment details did not match this order. Contact Ownly support.</p>}
    {query.error === 'paypal' && <p className="alert alert-error" role="alert">PayPal checkout could not be started. Please try again.</p>}
    {query.error && <p className="alert alert-error" role="alert">That order action could not be completed ({query.error}). Check the order status and try again.</p>}
    <section className="panel dashboard-panel">
      <div className="order-summary"><div><span className="eyebrow">Order status</span><p><span className={`status status-${order.delivery_status}`}>{order.delivery_status.replaceAll('_', ' ')}</span></p></div><div><span className="eyebrow">Total</span><p className="detail-price">{gross}</p></div></div>
      {items?.map((item, index) => <article className="dashboard-row" key={`${item.title_snapshot}-${index}`}><strong>{item.title_snapshot}</strong><span>{formatMinorCurrency(item.price_minor, item.currency)}</span></article>)}
      <p className="muted">Payment: {payments?.status ?? 'not initiated'} ({payments?.provider ?? 'no provider'}).{payments?.status !== 'succeeded' && ' This order is not paid.'}</p>
      {seller && order.commission_minor !== null && <p className="muted">Estimated seller net: {formatMinorCurrency(order.seller_net_minor ?? 0, order.currency)} Â· platform commission snapshot: {formatMinorCurrency(order.commission_minor, order.currency)} ({((order.commission_bps ?? 0) / 100).toFixed(2)}%).</p>}
      {seller && payout && <p className="muted">Seller payout record: {formatMinorCurrency(payout.amount_minor, payout.currency)} Â· {payout.status}. Ownly sends eligible payouts manually after the buyer confirms receipt.</p>}
      {delivery && <section className="order-delivery"><h2>Digital delivery</h2><p style={{ whiteSpace: 'pre-wrap' }}>{delivery.delivery_content}</p><p className="muted">Submitted {new Date(delivery.created_at).toLocaleString()}</p></section>}
    </section>
    {buyer && order.delivery_status === 'pending_payment' && <section className="panel dashboard-panel" style={{ marginTop: 15 }}>
      {payments?.provider === 'paypal' && isPaypalCheckoutEnabled()
        ? <form action={retryPaypalCheckout}><input type="hidden" name="order_id" value={id}/><button className="btn">Continue to PayPal</button><p className="muted">Only retry if PayPal confirms the previous attempt was cancelled or unpaid.</p></form>
        : <p>Checkout isnâ€™t configured yet. This order has not been charged.</p>}
      {!payments?.provider_reference && <form action={cancelPendingOrder}><input type="hidden" name="order_id" value={id}/><ConfirmSubmitButton className="btn btn-secondary" confirmation="Cancel this unpaid order?">Cancel unpaid order</ConfirmSubmitButton></form>}
    </section>}
    {seller && order.status === 'paid' && order.delivery_status === 'awaiting_delivery' && <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Deliver the digital product</h2><p className="alert alert-warning">Only send delivery after payment is confirmed through an approved provider. Do not include credentials until a secure delivery process is approved.</p><form action={deliverOrder} className="auth-form"><input type="hidden" name="order_id" value={id}/><label>Delivery details<textarea className="field" name="delivery_content" minLength={1} maxLength={10000} rows={6} required/></label><button className="btn">Submit delivery</button></form></section>}
    {buyer && order.delivery_status === 'awaiting_confirmation' && <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Review delivery</h2><p>Confirm receipt only after the digital product has been transferred and checked.</p><form action={confirmOrderReceipt}><input type="hidden" name="order_id" value={id}/><ConfirmSubmitButton className="btn" confirmation="Confirm that you received the digital product?">Confirm receipt</ConfirmSubmitButton></form><form action={reportOrderProblem} className="auth-form"><input type="hidden" name="order_id" value={id}/><label>Report a problem<input className="field" name="reason" minLength={10} maxLength={2000} required placeholder="Describe the issue"/></label><button className="btn btn-secondary">Request order help</button></form></section>}
  </main></>;
}
