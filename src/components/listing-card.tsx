import Link from 'next/link';
import Image from 'next/image';
import { Gamepad2, Globe2, Shapes, Youtube } from 'lucide-react';
import { formatMinorCurrency } from '@/lib/marketplace';
import { FavoriteButton } from '@/components/favorite-button';

type Relation<T> = T | T[] | null | undefined;

export type ListingCardListing = {
  id: string;
  title: string;
  price_minor: number;
  currency: string;
  categories?: Relation<{ name?: string; slug?: string }>;
  profiles?: Relation<{ display_name?: string }>;
  favorite?: boolean;
  canFavorite?: boolean;
  imageUrl?: string | null;
};

type ListingCardProps = { listing: ListingCardListing };

function firstRelation<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

function categoryIcon(slug?:string) {
  if (slug === 'gaming') return Gamepad2;
  if (slug === 'youtube') return Youtube;
  if (slug === 'websites') return Globe2;
  return Shapes;
}

export function ListingCard({listing}:ListingCardProps) {
  const category = firstRelation(listing.categories);
  const profile = firstRelation(listing.profiles);
  const Icon = categoryIcon(category?.slug);
  const price = formatMinorCurrency(listing.price_minor, listing.currency);
  return <article className="listing-card" style={{ position: 'relative' }}>
    <Link href={`/listing/${listing.id}`} aria-label={`View ${listing.title}`}>
    <div className="listing-art" aria-hidden={!listing.imageUrl}>
      {listing.imageUrl ? <Image src={listing.imageUrl} alt={listing.title} fill unoptimized sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"/> : <Icon />}
    </div>
    <div className="listing-content">
      <div className="listing-meta"><span>{category?.name ?? 'Digital property'}</span></div>
      <h3 className="listing-title">{listing.title}</h3>
      <div className="listing-footer"><span className="listing-price">{price}</span>{profile?.display_name&&<span className="listing-seller">{profile.display_name}</span>}</div>
    </div>
    </Link>
    {listing.canFavorite && <FavoriteButton listingId={listing.id} initialSaved={listing.favorite} compact/>}
  </article>;
}
