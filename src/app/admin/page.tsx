import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { firstRelation } from '@/lib/supabase/relations';

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; deleted?: string }> }) {
  const params = await searchParams;
  const db = await createClient();
  if (!db) return <p className="alert alert-error" role="alert">Supabase is not configured.</p>;
  const [users, listings, pending, active, rejected, removed, restricted, reports, activity] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('listings').select('id', { count: 'exact', head: true }),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'removed'),
    db.from('user_restrictions').select('user_id', { count: 'exact', head: true }),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('admin_audit_logs').select('id,actor_id,action,target_type,target_id,reason,created_at,profiles(display_name)').order('created_at', { ascending: false }).limit(10),
  ]);
  const failed = [users, listings, pending, active, rejected, removed, restricted, reports, activity].some((result) => result.error);
  const cards = [
    ['Registered users', users.count],
    ['Total listings', listings.count],
    ['Pending listings', pending.count],
    ['Active listings', active.count],
    ['Rejected listings', rejected.count],
    ['Removed listings', removed.count],
    ['Restricted users', restricted.count],
    ['Open reports', reports.count],
  ];

  return <>
    <div className="eyebrow">Marketplace operations</div>
    <h1 className="page-title">Admin overview</h1>
    {params.updated && <p className="alert alert-success" role="status">Administrative change completed.</p>}
    {params.deleted && <p className="alert alert-success" role="status">Listing permanently deleted.</p>}
    {params.error && <p className="alert alert-error" role="alert">The administrative action failed ({params.error}). Check the reason and permissions, then try again.</p>}
    {failed && <p className="alert alert-error" role="alert">Some overview data could not be loaded. Check the database policies and try again.</p>}
    <section className="dashboard-grid" aria-label="Marketplace totals">
      {cards.map(([label, count]) => <article key={label} className="panel dashboard-panel"><div className="eyebrow">{label}</div><div className="page-title">{count ?? '—'}</div></article>)}
    </section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}>
      <div className="section-heading"><div><div className="eyebrow">Recent marketplace activity</div><h2 className="section-title" style={{ fontSize: 19 }}>Staff activity</h2></div><Link href="/admin/activity" className="text-link">View all</Link></div>
      {activity.data?.length ? activity.data.map((entry) => <article key={entry.id} className="admin-row"><div className="admin-listing-info"><strong>{entry.action}</strong><span className="muted">{entry.reason}</span><span className="subtle" style={{ fontSize: 10 }}>By {firstRelation(entry.profiles)?.display_name ?? entry.actor_id} · Target: {entry.target_type}{entry.target_id ? ` · ${entry.target_id}` : ''}</span></div><time className="muted" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></article>) : <div className="empty-state"><strong>No recent activity</strong>Administrative actions will appear here.</div>}
    </section>
  </>;
}
