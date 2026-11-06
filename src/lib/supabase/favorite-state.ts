import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListingCardListing } from '@/components/listing-card';

export async function annotateFavoriteListings(db: SupabaseClient, listings: ListingCardListing[]): Promise<ListingCardListing[]> {
  if (!listings.length) return listings;

  const listingIds = listings.map((listing) => listing.id);
  const [{ data: { user } }, { data: imageRows }] = await Promise.all([
    db.auth.getUser(),
    db.from('listing_images').select('listing_id,storage_path,position').in('listing_id', listingIds).order('position').order('id'),
  ]);

  const primaryImageByListing = new Map<string, string>();
  for (const image of imageRows ?? []) {
    if (!primaryImageByListing.has(image.listing_id)) primaryImageByListing.set(image.listing_id, image.storage_path);
  }

  const primaryPaths = [...primaryImageByListing.values()];
  const { data: signedImages } = primaryPaths.length
    ? await db.storage.from('ownly-listing-images').createSignedUrls(primaryPaths, 3600)
    : { data: [] };
  const urlByPath = new Map(primaryPaths.map((path, index) => [path, signedImages?.[index]?.signedUrl ?? null]));

  let saved = new Set<string>();
  if (user) {
    const { data } = await db.from('favorites').select('listing_id').eq('user_id', user.id).in('listing_id', listingIds);
    saved = new Set((data ?? []).map((favorite) => favorite.listing_id));
  }

  return listings.map((listing) => {
    const path = primaryImageByListing.get(listing.id);
    const imageUrl = path ? urlByPath.get(path) ?? null : null;
    return {
      ...listing,
      imageUrl,
      ...(user ? { canFavorite: true, favorite: saved.has(listing.id) } : {}),
    };
  });
}
