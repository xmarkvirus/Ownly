import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

const staffNavigation = [
  ['Overview', '/admin'],
  ['Listings', '/admin/listings'],
  ['Reports', '/admin/reports'],
  ['Activity logs', '/admin/activity'],
];

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: role, error } = await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (error) redirect('/login?error=authorization');
  if (!role) redirect('/dashboard');

  const navigation = role.role === 'admin'
    ? [...staffNavigation, ['Payouts', '/admin/payouts'], ['Users', '/admin/users'], ['Moderators', '/admin/moderators'], ['Settings', '/admin/settings']]
    : staffNavigation;

  return <>
    <SiteHeader/>
    <main className="wrap page">
      <nav className="panel admin-nav" aria-label="Admin navigation">
        {navigation.map(([label, href]) => <Link key={href} href={href} className="btn btn-secondary">{label}</Link>)}
        <span className="admin-role-label">Signed in as {role.role}</span>
      </nav>
      {children}
    </main>
  </>;
}
