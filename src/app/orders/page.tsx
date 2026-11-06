import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';
import { formatMinorCurrency } from '@/lib/marketplace';

export default async function OrdersPage() {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: orders, error } = await db.from('orders').select('id,buyer_id,seller_id,status,currency,subtotal_minor,delivery_status,created_at').or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order('created_at', { ascending: false });
  return <><SiteHeader/><main className="wrap page"><div className="eyebrow">Marketplace transactions</div><h1 className="page-title">Orders</h1>
    <p className="body-copy">Payment processing is not enabled yet. Any pending order shown here has not been charged.</p>
    {error && <p className="alert alert-error" role="alert">Orders could not be loaded. Check the Supabase migration setup.</p>}
    {orders?.length ? <section className="panel dashboard-panel">{orders.map((order) => <article className="admin-row" key={order.id}><div className="admin-listing-info"><strong>Order {order.id.slice(0, 8).toUpperCase()}</strong><span className="muted">{order.buyer_id === user.id ? 'Purchase' : 'Sale'} · {formatMinorCurrency(order.subtotal_minor, order.currency)}</span><span className="subtle">{order.delivery_status.replaceAll('_', ' ')} · {new Date(order.created_at).toLocaleDateString()}</span></div><Link className="btn btn-secondary" href={`/orders/${order.id}`}>Order details</Link></article>)}</section>
      : <div className="empty-state"><strong>No orders yet</strong>Orders will appear here after an order is prepared from an active listing.</div>}
  </main></>;
}
