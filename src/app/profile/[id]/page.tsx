import Image from 'next/image';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ListingCard, type ListingCardListing } from '@/components/listing-card';
import { createClient } from '@/lib/supabase/server';
import { annotateFavoriteListings } from '@/lib/supabase/favorite-state';

export default async function PublicProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  if (!db) notFound();
  const { data: profile } = await db.from('profiles').select('id,display_name,bio,avatar_path,created_at').eq('id', id).maybeSingle();
  if (!profile) notFound();
  const { data: listings } = await db.from('listings').select('id,title,price_minor,currency,categories!listings_category_id_fkey(name,slug),profiles!listings_seller_id_fkey(display_name)').eq('seller_id', id).eq('status', 'active').order('created_at', { ascending: false });
  const avatarUrl = profile.avatar_path ? db.storage.from('ownly-avatars').getPublicUrl(profile.avatar_path).data.publicUrl : null;
  const publicListings = await annotateFavoriteListings(db, (listings ?? []) as ListingCardListing[]);

  return <><SiteHeader/><main className="wrap page">
    <section className="panel profile-heading">
      <div className="avatar" aria-hidden="true">{avatarUrl ? <Image src={avatarUrl} alt="" width={58} height={58} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : profile.display_name.slice(0, 1).toUpperCase()}</div>
      <div><div className="eyebrow">Ownly member</div><h1 className="page-title" style={{ fontSize: 29, margin: '4px 0' }}>{profile.display_name}</h1><p className="muted" style={{ fontSize: 12, margin: 0 }}>Member since {new Date(profile.created_at).toLocaleDateString()}</p></div>
    </section>
    {profile.bio && <p className="body-copy" style={{ marginTop: 19, whiteSpace: 'pre-wrap' }}>{profile.bio}</p>}
    <section className="section"><div className="section-heading"><div><div className="eyebrow">Seller information</div><h2 className="section-title">Active listings</h2></div><span className="results-count">{publicListings.length} shown</span></div>
      {publicListings.length ? <div className="listing-grid">{publicListings.map((listing) => <ListingCard key={listing.id} listing={listing}/>)}</div> : <div className="empty-state"><strong>No active listings</strong>This member has no public listings right now.</div>}
    </section>
  </main></>;
}
