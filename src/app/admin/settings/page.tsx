import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { setCommissionRate } from '@/app/actions';
import { isPaypalCheckoutEnabled } from '@/lib/payments/provider';

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ commission?: string; error?: string }> }) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (role?.role !== 'admin') redirect('/dashboard');
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const siteUrlConfigured = Boolean(process.env.NEXT_PUBLIC_SITE_URL);
  const serviceKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const checkoutEnabled = isPaypalCheckoutEnabled();
  const paypalMode = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
  const params = await searchParams;
  const { data: commission } = await db.from('marketplace_settings').select('value_integer').eq('setting_key', 'commission_bps').maybeSingle();
  const commissionPercent = commission?.value_integer == null ? '5.00' : (commission.value_integer / 100).toFixed(2);
  return <>
    <div className="eyebrow">Platform operations</div><h1 className="page-title">Settings</h1>
    <section className="panel dashboard-panel"><h2>Connection status</h2><div className="dashboard-list"><div className="dashboard-row"><span>Supabase connection settings</span><span className={`status ${supabaseConfigured ? 'status-active' : 'status-rejected'}`}>{supabaseConfigured ? 'configured' : 'missing'}</span></div><div className="dashboard-row"><span>Server database key</span><span className={`status ${serviceKeyConfigured ? 'status-active' : 'status-rejected'}`}>{serviceKeyConfigured ? 'configured' : 'missing'}</span></div><div className="dashboard-row"><span>Site URL</span><span className={`status ${siteUrlConfigured ? 'status-active' : 'status-rejected'}`}>{siteUrlConfigured ? 'configured' : 'missing'}</span></div></div><p className="muted">Credential values are intentionally not shown in the admin interface.</p></section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Marketplace operations</h2><p><span className={`status ${checkoutEnabled ? 'status-active' : 'status-paused'}`}>{checkoutEnabled ? `PayPal ${paypalMode} checkout enabled` : 'PayPal checkout disabled'}</span></p><p className="muted">Checkout requires both server flags, PayPal credentials, a webhook ID, and the Supabase service key. Keep live checkout disabled until PayPal confirms your account may collect payments for marketplace sellers. Subscribe the webhook at /api/webhooks/payments/paypal to PAYMENT.CAPTURE.COMPLETED. Ownly sends seller payouts manually after buyers confirm delivery; admins record each PayPal transfer under Payouts. Refunds and chargebacks still need manual reconciliation.</p></section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Commission configuration</h2><p className="muted">This setting applies to new order snapshots only. Historical commission calculations do not change. The temporary default is 5%; review it against payment processing costs before taking live payments.</p>{params.commission && <p className="alert alert-success" role="status">Commission rate saved.</p>}{params.error && <p className="alert alert-error" role="alert">Commission rate could not be saved. It must be between 0% and 25%.</p>}<form action={setCommissionRate} className="auth-form" style={{ maxWidth: 360 }}><label>Commission percentage<input className="field" type="number" name="commission_percent" min="0" max="25" step="0.01" defaultValue={commissionPercent} required/></label><button className="btn btn-secondary">Save commission rate</button></form></section>
  </>;
}
