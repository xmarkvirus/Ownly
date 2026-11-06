import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { firstRelation } from '@/lib/supabase/relations';

type ActivityParams = { q?: string; target?: string; page?: string };

export default async function AdminActivity({ searchParams }: { searchParams: Promise<ActivityParams> }) {
  const db = await createClient();
  if (!db) return <p className="alert alert-error" role="alert">Supabase is not configured.</p>;
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  let query = db.from('admin_audit_logs').select('id,actor_id,action,target_type,target_id,reason,created_at,profiles(display_name)', { count: 'exact' });
  if (params.q?.trim()) query = query.ilike('reason', `%${params.q.trim().slice(0, 80)}%`);
  if (params.target?.trim()) query = query.eq('target_type', params.target.trim().slice(0, 40));
  const result = await query.order('created_at', { ascending: false }).range((page - 1) * 50, page * 50 - 1);
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / 50));
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set('q', params.q);
    if (params.target) next.set('target', params.target);
    next.set('page', String(nextPage));
    return `/admin/activity?${next.toString()}`;
  };

  return <>
    <div className="eyebrow">Administrative history</div><h1 className="page-title">Activity logs</h1>
    <p className="body-copy">Audit entries are read-only here. They are written by authorized server actions and database triggers.</p>
    {result.error && <p className="alert alert-error" role="alert">Audit history could not be loaded.</p>}
    <form action="/admin/activity" method="get" className="panel filter-panel" style={{ position: 'static', marginBottom: 18 }}><div className="filter-stack"><label>Reason contains<input className="field" name="q" maxLength={80} defaultValue={params.q}/></label><label>Target type<input className="field" name="target" maxLength={40} defaultValue={params.target}/></label><button className="btn">Filter activity</button><Link className="btn btn-secondary" href="/admin/activity">Clear</Link></div></form>
    {result.data?.length ? <section className="panel dashboard-panel">{result.data.map((entry) => <article key={entry.id} className="admin-row"><div className="admin-listing-info"><strong>{entry.action}</strong><span className="muted">{entry.reason}</span><span className="subtle" style={{ fontSize: 10 }}>Administrator: <Link className="text-link" href={`/profile/${entry.actor_id}`}>{firstRelation(entry.profiles)?.display_name ?? entry.actor_id}</Link> · Target: {entry.target_type}{entry.target_id ? ` · ${entry.target_id}` : ''}</span></div><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></article>)}</section> : !result.error && <div className="empty-state"><strong>No audit entries</strong>Administrative activity will be retained here.</div>}
    <nav className="pagination" aria-label="Audit pages"><span>{result.count ?? 0} entries · Page {page} of {pages}</span>{page > 1 && <Link className="btn btn-secondary" href={pageHref(page - 1)}>Previous</Link>}{page < pages && <Link className="btn btn-secondary" href={pageHref(page + 1)}>Next</Link>}</nav>
  </>;
}
