import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type UserParams = { q?: string; page?: string };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<UserParams> }) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (role?.role !== 'admin') redirect('/dashboard');
  const params = await searchParams;
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  const { data, error } = await db.rpc('admin_search_users', { p_query: search || null, p_limit: 51, p_offset: (page - 1) * 50 });
  const hasNext = (data?.length ?? 0) > 50;
  const users = data?.slice(0, 50) ?? [];

  return <>
    <div className="eyebrow">Account administration</div><h1 className="page-title">Users</h1>
    <form action="/admin/users" method="get" className="panel filter-panel" style={{ position: 'static', marginBottom: 18 }}><div className="filter-stack"><label>Search email, display name, or user ID<input className="field" name="q" defaultValue={search} maxLength={100}/></label><button className="btn">Search users</button><Link className="btn btn-secondary" href="/admin/users">Clear</Link></div></form>
    {error && <p className="alert alert-error" role="alert">User search failed. Confirm migration 003 is applied and that your role is admin.</p>}
    {users.length ? <section className="panel dashboard-panel">{users.map((profile: { user_id: string; display_name: string | null; email: string; created_at: string; role: string | null; restricted: boolean; restriction_reason: string | null }) => <article key={profile.user_id} className="admin-row">
      <div className="admin-listing-info"><strong>{profile.display_name || 'Member'}</strong><span className="muted">{profile.email}</span><span className="subtle">{profile.user_id}</span><span className="subtle" style={{ fontSize: 10 }}>Joined {new Date(profile.created_at).toLocaleDateString()} · {profile.role ?? 'member'} · {profile.restricted ? `restricted: ${profile.restriction_reason}` : 'unrestricted'}</span></div>
      <div className="admin-actions"><Link className="btn btn-secondary" href={`/admin/users/${profile.user_id}`}>Manage account</Link><Link className="text-link" href={`/profile/${profile.user_id}`}>Public profile</Link></div>
    </article>)}</section> : !error && <div className="empty-state"><strong>No matching users</strong>Search by account email, public display name, or exact user ID.</div>}
    <nav className="pagination" aria-label="User pages"><span>Page {page}</span>{page > 1 && <Link className="btn btn-secondary" href={`/admin/users?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page - 1) })}`}>Previous</Link>}{hasNext && <Link className="btn btn-secondary" href={`/admin/users?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page + 1) })}`}>Next</Link>}</nav>
  </>;
}
