import { createClient } from '@/lib/supabase/server';
import { markSellerPayoutPaid } from '@/app/actions';
import { formatMinorCurrency } from '@/lib/marketplace';

export default async function AdminPayouts({ searchParams }: { searchParams: Promise<{ paid?: string; error?: string }> }) {
  const params = await searchParams;
  const db = await createClient();
  if (!db) return <p className="alert alert-error" role="alert">Supabase is not configured.</p>;
  const { data: payouts, error } = await db.from('seller_payouts')
    .select('id,order_id,seller_id,amount_minor,currency,status,provider_reference,created_at,paid_at')
    .order('created_at', { ascending: false }).limit(100);
  const sellerIds = [...new Set((payouts ?? []).map((payout) => payout.seller_id))];
  const orderIds = [...new Set((payouts ?? []).map((payout) => payout.order_id))];
  const [{ data: profiles }, { data: orders }, { data: paymentDetails }] = await Promise.all([
    sellerIds.length ? db.from('profiles').select('id,display_name').in('id', sellerIds) : Promise.resolve({ data: [] }),
    orderIds.length ? db.from('orders').select('id,status,delivery_status').in('id', orderIds) : Promise.resolve({ data: [] }),
    sellerIds.length ? db.from('seller_payment_details').select('seller_id,paypal_email').in('seller_id', sellerIds) : Promise.resolve({ data: [] }),
  ]);
  const sellerNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const orderStatuses = new Map((orders ?? []).map((order) => [order.id, order.delivery_status]));
  const sellerEmails = new Map((paymentDetails ?? []).map((details) => [details.seller_id, details.paypal_email]));

  return <>
    <div className="eyebrow">Marketplace operations</div><h1 className="page-title">Seller payouts</h1>
    <p className="body-copy">Send eligible seller payments from PayPal, then record the PayPal transaction ID here. Recording a payout does not send money.</p>
    {params.paid && <p className="alert alert-success" role="status">Seller payout recorded.</p>}
    {params.error && <p className="alert alert-error" role="alert">Payout could not be recorded ({params.error}). Check the transaction ID and payout status.</p>}
    {error && <p className="alert alert-error" role="alert">Payouts could not be loaded. Check the database permissions.</p>}
    {payouts?.length ? <section className="panel dashboard-panel">{payouts.map((payout) => {
      const state = orderStatuses.get(payout.order_id);
      const paypalEmail = sellerEmails.get(payout.seller_id);
      const canPay = payout.status === 'eligible' && state === 'completed' && !!paypalEmail;
      return <article className="admin-row" key={payout.id}>
        <div className="admin-listing-info">
          <strong>{formatMinorCurrency(payout.amount_minor, payout.currency)} · {sellerNames.get(payout.seller_id) ?? 'Ownly seller'}</strong>
          <span className="muted">Order {payout.order_id.slice(0, 8).toUpperCase()} · seller {payout.seller_id}</span>
          {paypalEmail && <span className="muted">Seller PayPal: {paypalEmail}</span>}
          <span className="subtle">{payout.status === 'paid' ? `Paid ${payout.paid_at ? new Date(payout.paid_at).toLocaleString() : ''} · PayPal ref ${payout.provider_reference}` : `Order ${state ?? 'unknown'} · created ${new Date(payout.created_at).toLocaleDateString()}`}</span>
        </div>
        {canPay && <form action={markSellerPayoutPaid} className="admin-actions">
          <input type="hidden" name="payout_id" value={payout.id}/>
          <label className="visually-hidden" htmlFor={`payout-ref-${payout.id}`}>PayPal transaction ID</label>
          <input className="field" id={`payout-ref-${payout.id}`} name="provider_reference" minLength={3} maxLength={128} required placeholder="PayPal transaction ID"/>
          <button className="btn">Record payout as sent</button>
        </form>}
        {!canPay && <span className={`status status-${payout.status}`}>{payout.status === 'eligible' ? (state !== 'completed' ? `Order ${state ?? 'unknown'}` : paypalEmail ? 'eligible' : 'seller must add PayPal email') : payout.status}</span>}
      </article>;
    })}</section> : !error && <div className="empty-state"><strong>No seller payouts yet</strong>Eligible payouts appear after a buyer confirms delivery.</div>}
  </>;
}
