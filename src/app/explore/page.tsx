import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { ListingCard, type ListingCardListing } from '@/components/listing-card';
import { createClient } from '@/lib/supabase/server';
import { annotateFavoriteListings } from '@/lib/supabase/favorite-state';

type Params={q?:string;category?:string;min?:string;max?:string;sort?:string;page?:string};
type Category = { id: string; slug: string; name: string };
export default async function Explore({searchParams}:{searchParams:Promise<Params>}) {
  const p=await searchParams,db=await createClient();
  let rows: ListingCardListing[] = [];
  let cats: Category[] = [];
  let total = 0;
  const currentPage=Math.max(1,Number(p.page)||1),params=new URLSearchParams();
  for(const [key,value] of Object.entries(p))if(value&&key!=='page')params.set(key,value);
  const pageHref=(page:number)=>{const next=new URLSearchParams(params);next.set('page',String(page));return `/explore?${next.toString()}`;};
  if(db){
    cats=(await db.from('categories').select('id,slug,name').eq('active',true).order('name')).data??[];
    let query=db.from('listings').select('id,title,price_minor,currency,categories!listings_category_id_fkey(name,slug),profiles!listings_seller_id_fkey(display_name)',{count:'exact'}).eq('status','active');
    if(p.q)query=query.textSearch('search_document',p.q,{type:'websearch'});
    if(p.min&&Number.isFinite(Number(p.min)))query=query.gte('price_minor',Math.max(0,Number(p.min)*100));
    if(p.max&&Number.isFinite(Number(p.max)))query=query.lte('price_minor',Number(p.max)*100);
    const category=cats.find(item=>item.slug===p.category);if(category)query=query.eq('category_id',category.id);
    query=p.sort==='low'?query.order('price_minor',{ascending:true}):p.sort==='high'?query.order('price_minor',{ascending:false}):query.order('created_at',{ascending:false});
    const result=await query.range((currentPage-1)*12,(currentPage-1)*12+11);rows=await annotateFavoriteListings(db, result.data??[]);total=result.count??0;
  }
  const selectedCategory=cats.find(item=>item.slug===p.category);
  return <><SiteHeader/><main className="wrap page">
    <div className="eyebrow">The Ownly marketplace</div><h1 className="page-title">Explore digital property</h1><p className="body-copy" style={{marginTop:0,marginBottom:28}}>Find a listing that fits what you’re looking for, then connect with its owner.</p>
    <div className="explore-layout">
      <aside className="panel filter-panel"><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:15}}><SlidersHorizontal size={15} color="var(--accent-soft)"/><h2 style={{margin:0}}>Filters</h2></div>
        <form action="/explore" className="filter-stack">
          <label className="filter-wide">Search<input className="field" name="q" placeholder="Keywords" defaultValue={p.q}/></label>
          <label className="filter-wide">Category<select className="field" name="category" defaultValue={p.category??''}><option value="">All categories</option>{cats.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
          <div className="filter-wide"><span style={{display:'block',marginBottom:7,color:'#e4e4e7',fontSize:13,fontWeight:550}}>Price range</span><div className="price-fields"><input className="field" aria-label="Minimum price" name="min" type="number" min="0" step="0.01" placeholder="Min" defaultValue={p.min}/><input className="field" aria-label="Maximum price" name="max" type="number" min="0" step="0.01" placeholder="Max" defaultValue={p.max}/></div></div>
          <label className="filter-wide">Sort by<select className="field" name="sort" defaultValue={p.sort??'newest'}><option value="newest">Newest</option><option value="low">Lowest price</option><option value="high">Highest price</option></select></label>
          <div className="filter-actions filter-wide"><button className="btn" style={{flex:1}}><Search size={14}/> Apply filters</button><Link href="/explore" className="btn btn-secondary">Clear</Link></div>
        </form>
      </aside>
      <section aria-label="Marketplace results">
        <div className="results-top"><div><h2 className="section-title" style={{fontSize:20}}>Listings</h2><div className="results-count" style={{marginTop:4}}>{db?`${total} ${total===1?'result':'results'}`:'Live catalog unavailable'}</div></div></div>
        {(p.q||selectedCategory||p.min||p.max)&&<div className="active-filters" aria-label="Active filters">{p.q&&<span className="filter-chip">Search: {p.q}</span>}{selectedCategory&&<span className="filter-chip">{selectedCategory.name}</span>}{p.min&&<span className="filter-chip">From {p.min}</span>}{p.max&&<span className="filter-chip">Up to {p.max}</span>}</div>}
        <div style={{marginTop:17}}>{!db?<div className="empty-state"><strong>Connect the marketplace catalog</strong>Supabase configuration is required to browse live listings.</div>:rows.length?<div className="listing-grid results-grid">{rows.map(listing=><ListingCard listing={listing} key={listing.id}/>)}</div>:<div className="empty-state"><strong>No listings match those filters</strong>Try a different search or clear some filters.</div>}</div>
        {db&&total>12&&<nav className="pagination" aria-label="Listing pages">{currentPage>1?<Link className="btn btn-secondary" href={pageHref(currentPage-1)}>Previous</Link>:<span className="muted">Previous</span>}<span className="results-count">Page {currentPage} of {Math.ceil(total/12)}</span>{currentPage<Math.ceil(total/12)?<Link className="btn btn-secondary" href={pageHref(currentPage+1)}>Next</Link>:<span className="muted">Next</span>}</nav>}
      </section>
    </div>
  </main></>;
}
