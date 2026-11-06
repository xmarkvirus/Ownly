import Link from 'next/link';
import { Search, Plus, CircleUserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/actions';

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: staffRole } = supabase && data.user
    ? await supabase.from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle()
    : { data: null };
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link href="/" aria-label="Ownly home" className="wordmark">ownly<span className="wordmark-dot">.</span></Link>
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/explore">Explore</Link>
          <Link href="/explore?category=gaming">Gaming</Link>
          <Link href="/explore?category=websites">Websites</Link>
          <Link href="/how-it-works">How it works</Link>
        </nav>
        <form action="/explore" className="header-search">
          <Search className="header-search-icon" size={15} aria-hidden="true" />
          <input className="field" name="q" placeholder="Search assets" aria-label="Search digital assets" />
        </form>
        <div className="header-actions">
          {data.user ? <details className="header-menu"><summary className="btn btn-secondary"><CircleUserRound size={15} /> Account</summary><div className="header-menu-popover"><Link href="/dashboard">Dashboard</Link><Link href="/orders">Orders</Link><Link href="/favorites">Saved listings</Link><Link href="/profile">My profile</Link>{staffRole&&<Link href="/admin">Admin workspace</Link>}<Link href="/listings/new">Create a listing</Link><form action={signOut}><button>Log out</button></form></div></details> : <><Link href="/login" className="header-link muted">Log in</Link><Link href="/signup" className="btn btn-secondary">Join</Link></>}
          <Link href={data.user ? '/listings/new' : '/signup'} className="btn"><Plus size={15} /> Sell</Link>
        </div>
      </div>
    </header>
  );
}
