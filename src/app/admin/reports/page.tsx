import Link from 'next/link';
import { redirect } from 'next/navigation';
import { reviewReport } from '@/app/actions';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { createClient } from '@/lib/supabase/server';

type ReportParams = { status?: string; q?: string; page?: string; error?: string };
const reportStatuses = ['open', 'reviewing', 'resolved', 'dismissed'];

export default async function AdminReports({ searchParams }: { searchParams: Promise<ReportParams> }) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (!role) redirect('/dashboard');
  const params = await searchParams;
  const status = reportStatuses.includes(params.status ?? '') ? params.status : undefined;
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  let query = db.from('reports').select('id,reporter_id,reason,status,listing_id,conversation_id,created_at', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (params.q?.trim()) query = query.ilike('reason', `%${params.q.trim().slice(0, 80)}%`);
  const result = await query.order('created_at', { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / 20));

  return <>
    <div className="eyebrow">Community safety</div><h1 className="page-title">Reports</h1>
    {params.error && <p className="alert alert-error" role="alert">Report action failed ({params.error}). Verify migration 003 is applied and try again.</p>}
    <form action="/admin/reports" method="get" className="panel filter-panel" style={{ position: 'static', marginBottom: 18 }}>
      <div className="filter-stack"><label>Report reason<input className="field" name="q" maxLength={80} defaultValue={params.q}/></label><label>Status<select className="field" name="status" defaultValue={status ?? ''}><option value="">All statuses</option>{reportStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><button className="btn">Filter reports</button><Link href="/admin/reports" className="btn btn-secondary">Clear</Link></div>
    </form>
    {result.error && <p className="alert alert-error" role="alert">Reports could not be loaded.</p>}
    {result.data?.length ? <section className="panel dashboard-panel">{result.data.map((report) => <article key={report.id} className="admin-row">
      <div className="admin-listing-info"><strong>{report.listing_id ? 'Listing report' : 'Conversation report'}</strong><span className="muted">{report.reason}</span><span className="subtle" style={{ fontSize: 10 }}>Reporter: {report.reporter_id} · {new Date(report.created_at).toLocaleString()}</span><span className="subtle" style={{ fontSize: 10 }}>Target: {report.listing_id ?? report.conversation_id}</span><Link className="text-link" href={report.listing_id ? `/admin/listings/${report.listing_id}` : `/inbox/${report.conversation_id}`}>Inspect report target</Link></div>
      <div className="admin-actions"><span className={`status status-${report.status}`}>{report.status}</span>{['open', 'reviewing'].includes(report.status) && <form action={reviewReport} className="admin-actions"><input type="hidden" name="report_id" value={report.id}/><input className="field admin-note" name="reason" required minLength={5} maxLength={1000} placeholder="Administrative resolution reason" aria-label={`Administrative reason for report ${report.id}`}/>{report.status === 'open' && <button className="btn btn-secondary" name="status" value="reviewing">Mark reviewing</button>}<ConfirmSubmitButton className="btn" name="status" value="resolved" confirmation="Resolve this report and record the reason?">Resolve</ConfirmSubmitButton><ConfirmSubmitButton className="btn btn-danger" name="status" value="dismissed" confirmation="Dismiss this report? The report will leave the active queue.">Dismiss</ConfirmSubmitButton></form>}</div>
    </article>)}</section> : !result.error && <div className="empty-state"><strong>No reports found</strong>New reports will appear here for staff review.</div>}
    <nav className="pagination" aria-label="Report pages"><span>{result.count ?? 0} reports · Page {page} of {pages}</span>{page > 1 && <Link className="btn btn-secondary" href={`/admin/reports?${new URLSearchParams({ ...(status ? { status } : {}), ...(params.q ? { q: params.q } : {}), page: String(page - 1) })}`}>Previous</Link>}{page < pages && <Link className="btn btn-secondary" href={`/admin/reports?${new URLSearchParams({ ...(status ? { status } : {}), ...(params.q ? { q: params.q } : {}), page: String(page + 1) })}`}>Next</Link>}</nav>
  </>;
}
