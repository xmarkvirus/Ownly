import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { FavoritesList, type FavoriteItem } from '@/components/favorites-list';
import { createClient } from '@/lib/supabase/server';
import { firstRelation } from '@/lib/supabase/relations';

export default async function FavoritesPage() {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login?next=/favorites');
  const { data: favorites, error } = await db.from('favorites').select('listing_id,created_at').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return <><SiteHeader/><main className="wrap page"><h1 className="page-title">Saved listings</h1><p className="alert alert-error" role="alert">Your saved listings could not be loaded. Please retry.</p></main></>;
  const ids = (favorites ?? []).map((favorite) => favorite.listing_id);
  const listingsResult = ids.length ? await db.from('listings').select('id,title,status,price_minor,currency,seller_id,profiles!listings_seller_id_fkey(display_name)').in('id', ids) : { data: [], error: null };
  const listings = listingsResult.data ?? [];
  const { data: imageRows } = ids.length ? await db.from('listing_images').select('listing_id,storage_path,position').in('listing_id', ids).order('position') : { data: [] };
  const paths = (imageRows ?? []).map((image) => image.storage_path);
  const signed = paths.length ? await db.storage.from('ownly-listing-images').createSignedUrls(paths, 3600) : { data: [] };
  const imageUrls = new Map(paths.map((path, index) => [path, signed.data?.[index]?.signedUrl ?? null]));
  const imageByListing = new Map<string, string>();
  for (const image of imageRows ?? []) {
    const url = imageUrls.get(image.storage_path);
    if (url && !imageByListing.has(image.listing_id)) imageByListing.set(image.listing_id, url);
  }
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const items: FavoriteItem[] = ids.map((id) => {
    const listing = byId.get(id);
    return listing ? { id, title: listing.title, status: listing.status, price_minor: listing.price_minor, currency: listing.currency, image: imageByListing.get(id) ?? null, seller: firstRelation(listing.profiles)?.display_name ?? 'Ownly member' }
      : { id, title: 'This listing is no longer available', status: 'unavailable', price_minor: 0, currency: 'USD', image: null, seller: 'Ownly marketplace' };
  });
  return <><SiteHeader/><main className="wrap page"><div className="eyebrow">Your collection</div><h1 className="page-title">Saved listings</h1>
    {listingsResult.error && <p className="alert alert-error" role="alert">Some saved listings could not be loaded. You can still remove them.</p>}
    {items.length ? <FavoritesList items={items}/> : <div className="empty-state"><strong>Your saved list is empty</strong>Save listings you want to come back to.<p><Link className="btn" href="/explore">Explore listings</Link></p></div>}
  </main></>;
}
