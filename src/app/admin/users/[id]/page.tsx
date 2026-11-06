import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { liftUserRestriction, restrictUser } from '@/app/actions';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { createClient } from '@/lib/supabase/server';

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (role?.role !== 'admin') redirect('/dashboard');
  const [{ data: accounts, error: accountError }, { data: listings }, { data: reports }, { data: audit }] = await Promise.all([
    db.rpc('admin_search_users', { p_query: id, p_limit: 100, p_offset: 0 }),
    db.from('listings').select('id,title,status,price_minor,currency,created_at').eq('seller_id', id).order('created_at', { ascending: false }),
    db.from('reports').select('id,status,reason,listing_id,conversation_id,created_at').eq('reporter_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('admin_audit_logs').select('id,action,reason,created_at,actor_id').eq('target_type', 'user').eq('target_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  const profile = accounts?.find((account: { user_id: string }) => account.user_id === id);
  if (accountError || !profile) notFound();

  return <>
    <div className="eyebrow">Account review</div><h1 className="page-title">{profile.display_name || 'Member'}</h1>
    <section className="panel dashboard-panel"><p><strong>Email:</strong> {profile.email}</p><p><strong>User ID:</strong> {profile.user_id}</p><p><strong>Joined:</strong> {new Date(profile.created_at).toLocaleString()}</p><p><strong>Role:</strong> {profile.role ?? 'member'}</p><p><strong>Bio:</strong> {profile.bio || 'No bio set'}</p><p><strong>Restriction:</strong> {profile.restricted ? profile.restriction_reason : 'None'}</p><div className="admin-actions"><Link className="btn btn-secondary" href={`/profile/${id}`}>View public profile</Link><Link className="btn btn-secondary" href="/admin/moderators">Manage staff roles</Link></div>
    {profile.restricted ? <form action={liftUserRestriction} style={{ marginTop: 15 }}><input type="hidden" name="user_id" value={id}/><ConfirmSubmitButton className="btn btn-secondary" confirmation="Lift this account restriction?">Unrestrict account</ConfirmSubmitButton></form> : <form action={restrictUser} className="auth-form" style={{ maxWidth: 540 }}><input type="hidden" name="user_id" value={id}/><label>Restriction reason<input className="field" name="reason" minLength={5} maxLength={1000} required/></label><ConfirmSubmitButton className="btn btn-danger" confirmation={`Restrict ${profile.email} with this reason?`}>Restrict account</ConfirmSubmitButton></form>}
    </section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>User listings</h2>{listings?.length ? listings.map((listing) => <article key={listing.id} className="admin-row"><div className="admin-listing-info"><strong>{listing.title}</strong><span className="muted">{listing.status} · {new Intl.NumberFormat('en-US', { style: 'currency', currency: listing.currency }).format(listing.price_minor / 100)}</span></div><Link className="btn btn-secondary" href={`/admin/listings/${listing.id}`}>Review</Link></article>) : <div className="empty-state">This user has no listings.</div>}</section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Reports submitted</h2>{reports?.length ? reports.map((report) => <article key={report.id} className="admin-row"><div className="admin-listing-info"><strong>{report.status}</strong><span className="muted">{report.reason}</span><span className="subtle">{new Date(report.created_at).toLocaleString()} · {report.listing_id ?? report.conversation_id}</span></div><Link className="btn btn-secondary" href="/admin/reports">Review reports</Link></article>) : <div className="empty-state">This user has not submitted reports.</div>}</section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Account audit history</h2>{audit?.length ? audit.map((entry) => <article key={entry.id} className="admin-row"><div className="admin-listing-info"><strong>{entry.action}</strong><span className="muted">{entry.reason}</span><span className="subtle">By {entry.actor_id}</span></div><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></article>) : <div className="empty-state">No audit entries target this account.</div>}</section>
  </>;
}
