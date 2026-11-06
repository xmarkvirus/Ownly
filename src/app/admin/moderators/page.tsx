import Link from 'next/link';
import { redirect } from 'next/navigation';
import { changeUserRole } from '@/app/actions';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { createClient } from '@/lib/supabase/server';

type Params = { q?: string; page?: string; error?: string; updated?: string };

export default async function AdminModerators({ searchParams }: { searchParams: Promise<Params> }) {
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
  const users = data?.slice(0, 50) ?? [];
  const hasNext = (data?.length ?? 0) > 50;

  return <>
    <div className="eyebrow">Administrator permissions</div><h1 className="page-title">Moderators and administrators</h1>
    <p className="body-copy">To grant admin access, search for an account by email, enter a reason, then choose <strong>Make admin</strong>. Role changes are permission-checked and written to the audit log.</p>
    {params.updated && <p className="alert alert-success" role="status">Staff role updated.</p>}
    {params.error && <p className="alert alert-error" role="alert">The role change failed ({params.error}). The last administrator cannot be removed or demoted.</p>}
    <form action="/admin/moderators" method="get" className="panel filter-panel" style={{ position: 'static', marginBottom: 18 }}><div className="filter-stack"><label>Search by email, display name, or user ID<input className="field" name="q" defaultValue={search} maxLength={100}/></label><button className="btn">Search users</button></div></form>
    {error && <p className="alert alert-error" role="alert">User search failed. Confirm migration 003 is applied.</p>}
    {users.length ? <section className="panel dashboard-panel">{users.map((profile: { user_id: string; display_name: string | null; email: string; role: string | null }) => <article key={profile.user_id} className="admin-row">
      <div className="admin-listing-info"><strong>{profile.display_name || 'Member'}</strong><span className="muted">{profile.email}</span><span className="subtle">{profile.user_id} · {profile.role ?? 'member'}</span></div>
      <form action={changeUserRole} className="admin-actions"><input type="hidden" name="user_id" value={profile.user_id}/><input className="field admin-note" name="reason" required minLength={5} maxLength={1000} placeholder="Reason for role change" aria-label={`Reason for role change for ${profile.email}`}/>{profile.role !== 'moderator' && <ConfirmSubmitButton className="btn btn-secondary" name="role" value="moderator" confirmation={`Grant moderator privileges to ${profile.email}?`}>Make moderator</ConfirmSubmitButton>}{profile.role !== 'admin' && <ConfirmSubmitButton className="btn" name="role" value="admin" confirmation={`Grant full administrator privileges to ${profile.email}?`}>Make admin</ConfirmSubmitButton>}{profile.role && <ConfirmSubmitButton className="btn btn-danger" name="role" value="none" confirmation={`Remove ${profile.role} privileges from ${profile.email}?`}>Remove role</ConfirmSubmitButton>}<Link className="text-link" href={`/admin/users/${profile.user_id}`}>Account</Link></form>
    </article>)}</section> : !error && <div className="empty-state">No matching users.</div>}
    <nav className="pagination" aria-label="User pages">Page {page}{page > 1 && <Link className="btn btn-secondary" href={`/admin/moderators?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page - 1) })}`}>Previous</Link>}{hasNext && <Link className="btn btn-secondary" href={`/admin/moderators?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page + 1) })}`}>Next</Link>}</nav>
  </>;
}
