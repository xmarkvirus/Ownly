import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, Plus, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { signOut, updateListingStatus } from '@/app/actions';
import { SiteHeader } from '@/components/site-header';
import { firstRelation } from '@/lib/supabase/relations';
import { formatMinorCurrency } from '@/lib/marketplace';

export default async function Dashboard({searchParams}:{searchParams:Promise<{created?:string;conversation?:string;password?:string;updated?:string;error?:string}>}) {
  const db=await createClient();if(!db)redirect('/login?error=configuration');
  const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');
  const [{data:listings},{data:favorites},{data:convos}]=await Promise.all([
    db.from('listings').select('id,title,status,price_minor,currency,moderation_note,created_at').eq('seller_id',user.id).order('created_at',{ascending:false}),
    db.from('favorites').select('listing_id,listings(id,title,status,price_minor,currency)').eq('user_id',user.id),
    db.from('conversations').select('id,listing_id,buyer_id,seller_id,created_at,listings(title),messages(body,created_at,sender_id)').or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order('created_at',{ascending:false}),
  ]);
  const q=await searchParams;
  return <><SiteHeader/><main className="wrap page">
    <div style={{display:'flex',alignItems:'end',justifyContent:'space-between',gap:16,marginBottom:24}}><div><div className="eyebrow">Your Ownly</div><h1 className="page-title">Dashboard</h1><p className="muted" style={{margin:0,fontSize:13}}>Manage listings, saved assets, orders, and conversations.</p><div style={{display:'flex',gap:8,marginTop:11}}><Link className="text-link" href="/favorites">Saved listings</Link><Link className="text-link" href="/orders">Orders</Link><Link className="text-link" href="/profile">My profile</Link></div></div><div style={{display:'flex',gap:8}}><Link href="/listings/new" className="btn"><Plus size={15}/> New listing</Link><form action={signOut}><button className="btn btn-secondary" aria-label="Log out"><LogOut size={15}/></button></form></div></div>
    {q.created&&<p className="alert alert-success" role="status">Your listing was submitted for moderation.</p>}{q.updated&&<p className="alert alert-success" role="status">Your listing changes were submitted for moderation.</p>}{q.password&&<p className="alert alert-success" role="status">Your password was updated.</p>}{q.error&&<p className="alert alert-error" role="alert">The requested listing change could not be completed. Refresh and try again.</p>}
    <div className="dashboard-grid">
      <section className="panel dashboard-panel"><div className="section-heading"><div><div className="eyebrow">Seller workspace</div><h2 className="section-title" style={{fontSize:19}}>Your listings</h2></div><Link href="/listings/new" className="text-link">Create <ArrowUpRight size={14}/></Link></div>
        {listings?.length?<div className="dashboard-list">{listings.map(l=><article key={l.id} className="dashboard-row"><div style={{minWidth:0}}><strong className="listing-title" style={{margin:0,display:'block'}}>{l.title}</strong>{l.moderation_note&&<p className="muted" style={{fontSize:11,margin:'5px 0 0'}}>{l.moderation_note}</p>}</div><div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',justifyContent:'end'}}><span className={`status status-${l.status}`}>{l.status.replace('_',' ')}</span><Link href={`/listings/${l.id}/edit`} className="btn btn-secondary">Edit</Link>{(l.status==='active'||l.status==='paused')&&<form action={updateListingStatus}><input type="hidden" name="listing_id" value={l.id}/><button className="btn btn-secondary" name="status" value={l.status==='active'?'paused':'active'}>{l.status==='active'?'Pause':'Reactivate'}</button></form>}</div></article>)}</div>:<div className="empty-state"><strong>No listings yet</strong>Start by creating a listing for an asset you’re authorized to transfer.</div>}
      </section>
      <section className="panel dashboard-panel"><div className="section-heading"><div><div className="eyebrow">Your collection</div><h2 className="section-title" style={{fontSize:19}}>Saved listings</h2></div><Link href="/explore" className="text-link">Explore <ArrowUpRight size={14}/></Link></div>
        {favorites?.length?<div className="dashboard-list">{favorites.map(f=>{const listing=firstRelation(f.listings);return <div key={f.listing_id} className="dashboard-row">{listing?<Link href={`/listing/${f.listing_id}`} style={{fontSize:13,fontWeight:550}}>{listing.title}</Link>:<span className="muted" style={{fontSize:13}}>Listing unavailable</span>}<span className="muted" style={{fontSize:12}}>{listing?formatMinorCurrency(listing.price_minor,listing.currency):''}</span></div>})}</div>:<div className="empty-state"><strong>No saved listings</strong>Use Save listing to keep interesting properties here.</div>}
      </section>
    </div>
    <section className="panel dashboard-panel" style={{marginTop:15}}><div className="section-heading"><div><div className="eyebrow">Private messages</div><h2 className="section-title" style={{fontSize:19}}>Inquiries</h2></div></div>
      {convos?.length?<div className="dashboard-list">{convos.map(c=><Link key={c.id} href={`/inbox/${c.id}`} className="dashboard-row"><div style={{minWidth:0}}><strong style={{fontSize:13}}>{firstRelation(c.listings)?.title??'Listing conversation'}</strong><div className="muted" style={{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:4}}>{c.messages?.at(-1)?.body??'Conversation started'}</div></div><ArrowUpRight size={15} color="var(--subtle)"/></Link>)}</div>:<div className="empty-state"><strong>No conversations yet</strong>Messages with buyers and sellers will appear here.</div>}
    </section>
  </main></>;
}
