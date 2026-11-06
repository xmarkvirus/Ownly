import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { startConversation, startOrder } from '@/app/actions';
import { formatMinorCurrency } from '@/lib/marketplace';
import { FavoriteButton } from '@/components/favorite-button';
import { ListingGallery } from '@/components/listing-gallery';
import Image from 'next/image';
import { isPaypalCheckoutEnabled } from '@/lib/payments/provider';

export async function generateMetadata({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,db=await createClient();
  const {data}=db?await db.from('listings').select('title,description').eq('id',id).eq('status','active').single():{data:null};
  return {title:data?.title??'Listing',description:data?.description?.slice(0,155)??'Digital asset listing on Ownly'};
}

export default async function Listing({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}) {
  const {id}=await params,q=await searchParams,db=await createClient();if(!db)notFound();
  const {data:l}=await db.from('listings').select('*,categories!listings_category_id_fkey(name,slug,allowed_modes,active),profiles!listings_seller_id_fkey(display_name,avatar_path,bio,created_at)').eq('id',id).eq('status','active').single();
  if(!l)notFound();
  const {data:{user}}=await db.auth.getUser();
  let favorite=false;if(user){const {data}=await db.from('favorites').select('listing_id').eq('user_id',user.id).eq('listing_id',id).maybeSingle();favorite=!!data;}
  const { data: listingImages } = await db.from('listing_images').select('storage_path,alt_text,position').eq('listing_id', id).order('position').order('id');
  const imageRows = listingImages ?? [];
  const signedImages = imageRows.length ? await db.storage.from('ownly-listing-images').createSignedUrls(imageRows.map((image) => image.storage_path), 3600) : { data: [] };
  const gallery = imageRows.flatMap((image, index) => signedImages.data?.[index]?.signedUrl ? [{ url: signedImages.data[index].signedUrl, alt: image.alt_text || `${l.title} screenshot ${index + 1}` }] : []);
  const price=formatMinorCurrency(l.price_minor,l.currency);
  const displayName=l.profiles?.display_name??'Ownly member';
  const payWithPaypal = isPaypalCheckoutEnabled() && l.transaction_mode === 'ON_SITE' && l.categories?.active && l.categories.allowed_modes?.includes('ON_SITE');
  return <><SiteHeader/><main className="wrap page">
    <div className="eyebrow"><Link href={`/explore?category=${l.categories?.slug}`} className="text-link">{l.categories?.name}</Link><span aria-hidden="true"> / </span>Listed {new Date(l.created_at).toLocaleDateString()}</div>
    <h1 className="detail-title">{l.title}</h1>
    <div className="detail-layout" style={{marginTop:22}}>
      <article className="panel detail-main">
        <ListingGallery images={gallery}/>
        <div className="eyebrow">About this listing</div>
        <p className="detail-description">{l.description}</p>
        {l.attributes&&Object.keys(l.attributes).length>0&&<><h2 className="section-title" style={{fontSize:16,margin:'25px 0 12px'}}>Details</h2><div className="attribute-list">{Object.entries(l.attributes).map(([key,value])=><span className="attribute-item" key={key}>{key}: {String(value)}</span>)}</div></>}
        <div style={{marginTop:26,paddingTop:19,borderTop:'1px solid var(--border)'}}><div style={{display:'flex',gap:10,alignItems:'flex-start'}}><ShieldCheck size={17} color="var(--accent-soft)" style={{flex:'0 0 auto',marginTop:2}}/><p className="muted" style={{fontSize:12,margin:0,lineHeight:1.65}}>Confirm that any transfer complies with the relevant platform rules. Never share passwords, recovery codes, or authentication tokens.</p></div></div>
      </article>
      <aside className="panel detail-sidebar">
        <div className="eyebrow">Asking price</div><div className="detail-price" style={{marginTop:4}}>{price}</div><span className="status status-active" style={{marginTop:11}}>Available for inquiry</span>
        <div className="seller-row" style={{marginTop:19}}><Link href={`/profile/${l.seller_id}`} className="avatar" aria-label={`${displayName}'s profile`}>{l.profiles?.avatar_path ? <Image src={db.storage.from('ownly-avatars').getPublicUrl(l.profiles.avatar_path).data.publicUrl} alt="" width={42} height={42} unoptimized style={{width:'100%',height:'100%',objectFit:'cover'}}/> : displayName.slice(0,1).toUpperCase()}</Link><div style={{minWidth:0}}><Link href={`/profile/${l.seller_id}`} className="text-link">{displayName}</Link><div className="muted" style={{fontSize:11,marginTop:2}}>Member since {new Date(l.profiles?.created_at??l.created_at).toLocaleDateString()}</div></div></div>
        {q.error&&<p className="alert alert-error" role="alert">Your message couldn’t be sent. Please try again.</p>}
        {q.error === 'order' && <p className="alert alert-error" role="alert">An order could not be prepared. The listing may already have an order in progress.</p>}
        {q.error === 'checkout' && <p className="alert alert-error" role="alert">PayPal checkout is unavailable for this listing right now.</p>}
        {user?.id!==l.seller_id&&<div className="detail-actions">
          {user && payWithPaypal && <form action={startOrder}><input type="hidden" name="listing_id" value={id}/><button className="btn" style={{ width: '100%' }}>Pay with PayPal</button><p className="muted" style={{ fontSize: 11, margin: 0 }}>Ownly receives payment through PayPal. Seller payout is handled after delivery is confirmed.</p></form>}
          {user && !payWithPaypal && <p className="muted" style={{ fontSize: 12 }}>Online checkout isn’t available for this listing. Message the seller to discuss next steps.</p>}
          {user?<form action={startConversation} className="detail-actions"><input type="hidden" name="listing_id" value={id}/><label htmlFor="seller-message">Message the seller</label><textarea id="seller-message" className="field" name="message" placeholder="Ask a question about this listing" required maxLength={4000} rows={3}/><button className="btn">Send inquiry</button></form>:<Link href="/login" className="btn">Log in to contact seller</Link>}
          <FavoriteButton listingId={id} initialSaved={favorite} signedIn={!!user}/>
        </div>}
        <div style={{borderTop:'1px solid var(--border)',marginTop:18,paddingTop:14,display:'flex',justifyContent:'space-between',gap:10}}><span className="muted" style={{fontSize:11}}>No on-site checkout</span><Link href={`/report?listing=${id}`} className="muted" style={{fontSize:11,textDecoration:'underline',textUnderlineOffset:3}}>Report listing</Link></div>
      </aside>
    </div>
  </main></>;
}
