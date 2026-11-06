import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { firstRelation } from '@/lib/supabase/relations';
import { formatMinorCurrency } from '@/lib/marketplace';

type ListingSearch = { status?: string; category?: string; seller?: string; from?: string; to?: string; q?: string; page?: string };
const statuses = ['draft', 'pending_review', 'active', 'paused', 'unavailable', 'rejected', 'removed', 'archived'];
const validDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;

export default async function AdminListings({ searchParams }: { searchParams: Promise<ListingSearch> }) {
  const db = await createClient();
  if (!db) return <p className="alert alert-error" role="alert">Supabase is not configured.</p>;
  const params = await searchParams;
  const status = statuses.includes(params.status ?? '') ? params.status : undefined;
  const currentPage = Math.max(1, Math.min(10000, Number(params.page) || 1));
  const from = validDate(params.from);
  const to = validDate(params.to);
  const [{ data: categories }, { data: category }] = await Promise.all([
    db.from('categories').select('id,slug,name').order('name'),
    params.category ? db.from('categories').select('id').eq('slug', params.category).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let query = db.from('listings').select('id,title,status,created_at,seller_id,price_minor,currency,categories!listings_category_id_fkey(name),profiles!listings_seller_id_fkey(display_name)', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (params.q?.trim()) query = query.ilike('title', `%${params.q.trim().slice(0, 80)}%`);
  if (params.seller && /^[0-9a-f-]{36}$/i.test(params.seller)) query = query.eq('seller_id', params.seller);
  if (category) query = query.eq('category_id', category.id);
  if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
  if (to) query = query.lt('created_at', `${to}T00:00:00.000Z`);
  const result = await query.order('created_at', { ascending: false }).range((currentPage - 1) * 20, currentPage * 20 - 1);
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / 20));
  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value && key !== 'page') next.set(key, value);
    next.set('page', String(page));
    return `/admin/listings?${next.toString()}`;
  };

  return <>
    <div className="eyebrow">Marketplace control</div><h1 className="page-title">Listings</h1>
    <form action="/admin/listings" method="get" className="panel filter-panel" style={{ position: 'static', marginBottom: 18 }}>
      <div className="filter-stack">
        <label>Search title<input className="field" name="q" defaultValue={params.q} maxLength={80}/></label>
        <label>Status<select className="field" name="status" defaultValue={status ?? ''}><option value="">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Category<select className="field" name="category" defaultValue={params.category ?? ''}><option value="">All categories</option>{categories?.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
        <label>Seller user ID<input className="field" name="seller" defaultValue={params.seller} placeholder="Optional UUID"/></label>
        <label>Submitted from<input className="field" name="from" type="date" defaultValue={from}/></label>
        <label>Submitted through<input className="field" name="to" type="date" defaultValue={to}/></label>
        <button className="btn">Apply filters</button><Link href="/admin/listings" className="btn btn-secondary">Clear</Link>
      </div>
    </form>
    {result.error && <p className="alert alert-error" role="alert">Listings could not be loaded. Database error code: {result.error.code || 'unknown'}. Check the server logs for details.</p>}
    {result.data?.length ? <section className="panel dashboard-panel">{result.data.map((listing) => <article key={listing.id} className="admin-row">
      <div className="admin-listing-info"><strong>{listing.title}</strong><span className="muted">{firstRelation(listing.categories)?.name ?? 'Uncategorized'} · {formatMinorCurrency(listing.price_minor, listing.currency)} · {firstRelation(listing.profiles)?.display_name ?? listing.seller_id}</span><span className="subtle" style={{ fontSize: 10 }}>Submitted {new Date(listing.created_at).toLocaleDateString()}</span></div>
      <div className="admin-actions"><span className={`status status-${listing.status}`}>{listing.status.replace('_', ' ')}</span><Link className="btn btn-secondary" href={`/admin/listings/${listing.id}`}>Review details</Link></div>
    </article>)}</section> : !result.error && <div className="empty-state"><strong>No listings found</strong>Change the filters or search again.</div>}
    <nav className="pagination" aria-label="Listing pages"><span>{result.count ?? 0} listings · Page {currentPage} of {pages}</span>{currentPage > 1 && <Link className="btn btn-secondary" href={hrefFor(currentPage - 1)}>Previous</Link>}{currentPage < pages && <Link className="btn btn-secondary" href={hrefFor(currentPage + 1)}>Next</Link>}</nav>
  </>;
}
