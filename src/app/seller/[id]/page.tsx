import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { ListingCard } from '@/components/listing-card';
import { annotateFavoriteListings } from '@/lib/supabase/favorite-state';

export default async function Seller({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,db=await createClient();if(!db)notFound();
  const {data:profile}=await db.from('profiles').select('display_name,bio,created_at,avatar_path').eq('id',id).single();if(!profile)notFound();
  const {data:listings}=await db.from('listings').select('id,title,price_minor,currency,categories!listings_category_id_fkey(name,slug)').eq('seller_id',id).eq('status','active').order('created_at',{ascending:false});
  const cards = await annotateFavoriteListings(db, listings ?? []);
  return <><SiteHeader/><main className="wrap page">
    <div className="panel profile-heading"><div className="avatar" aria-hidden="true">{profile.avatar_path ? <Image src={db.storage.from('ownly-avatars').getPublicUrl(profile.avatar_path).data.publicUrl} alt="" width={58} height={58} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : profile.display_name.slice(0,1).toUpperCase()}</div><div><div className="eyebrow">Ownly seller</div><h1 className="page-title" style={{fontSize:29,margin:'4px 0'}}>{profile.display_name}</h1><p className="muted" style={{fontSize:12,margin:0}}>Member since {new Date(profile.created_at).toLocaleDateString()}</p></div></div>
    {profile.bio&&<p className="body-copy" style={{marginTop:19}}>{profile.bio}</p>}
    <section className="section" style={{marginTop:31}}><div className="section-heading"><div><div className="eyebrow">Public catalog</div><h2 className="section-title">Active listings</h2></div><span className="results-count">{listings?.length??0} shown</span></div>
      {cards.length?<div className="listing-grid">{cards.map(listing=><ListingCard listing={listing} key={listing.id}/>)}</div>:<div className="empty-state"><strong>No active listings</strong>This seller doesn’t have any public listings right now.</div>}
    </section>
  </main></>;
}
