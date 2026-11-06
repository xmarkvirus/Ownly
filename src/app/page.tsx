import Link from 'next/link';
import { ArrowRight, Gamepad2, Globe2, MessageCircle, ShieldCheck, Shapes, Youtube } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { ListingCard, type ListingCardListing } from '@/components/listing-card';
import { createClient } from '@/lib/supabase/server';
import { annotateFavoriteListings } from '@/lib/supabase/favorite-state';

const categoryIcons:Record<string,typeof Gamepad2>={gaming:Gamepad2,youtube:Youtube,websites:Globe2,other:Shapes,social:Shapes};
type Category = { id: string; slug: string; name: string };

export default async function Home() {
  const db=await createClient();
  let listings: ListingCardListing[] = [];
  let categories: Category[] = [];
  if(db){
    const [listingResult,categoryResult]=await Promise.all([
      db.from('listings').select('id,title,price_minor,currency,categories!listings_category_id_fkey(name,slug),profiles!listings_seller_id_fkey(display_name)').eq('status','active').order('created_at',{ascending:false}).limit(6),
      db.from('categories').select('id,name,slug').eq('active',true).order('name'),
    ]);
    listings=await annotateFavoriteListings(db, listingResult.data??[]); categories=categoryResult.data??[];
  }
  return <>
    <SiteHeader />
    <main>
      <section className="wrap hero-grid">
        <div>
          <div className="eyebrow">A considered marketplace for digital property</div>
          <h1 className="hero-title">Find what’s next<br/>in <span>digital ownership.</span></h1>
          <p className="hero-copy">Discover eligible digital assets, learn what makes each one valuable, and connect directly with its owner.</p>
          <form action="/explore" className="hero-search"><input className="field" name="q" aria-label="Search the marketplace" placeholder="Search channels, websites, and more"/><button className="btn">Search</button></form>
          <div className="hero-actions"><Link href="/explore" className="btn">Explore marketplace <ArrowRight size={15}/></Link><Link href="/listings/new" className="btn btn-secondary">Start selling</Link></div>
        </div>
        <aside className="panel hero-aside">
          <div className="eyebrow">A clearer way to connect</div>
          <h2>Good decisions begin with the right conversation.</h2>
          <div className="hero-point"><MessageCircle size={17}/><div><strong>Talk directly</strong><p>Start a private conversation with the listing owner.</p></div></div>
          <div className="hero-point"><ShieldCheck size={17}/><div><strong>Understand the terms</strong><p>Transfer rules vary by platform and asset category.</p></div></div>
          <div className="hero-point"><Shapes size={17}/><div><strong>Explore with care</strong><p>On-site purchases remain unavailable while integrations are reviewed.</p></div></div>
        </aside>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-heading"><div><div className="eyebrow">Browse with intention</div><h2 className="section-title">Explore categories</h2></div><Link href="/explore" className="text-link">All listings <ArrowRight size={14} style={{verticalAlign:'middle'}}/></Link></div>
          {categories.length ? <div className="category-grid">{categories.map((category)=>{const Icon=categoryIcons[category.slug]??Shapes;return <Link key={category.id} href={`/explore?category=${category.slug}`} className="surface category-link"><Icon className="category-icon" size={19}/><span>{category.name}</span><ArrowRight className="category-arrow" size={15}/></Link>})}</div> : <div className="empty-state"><strong>Categories are being set up</strong>Connect Ownly to its catalog to explore available asset types.</div>}
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-heading"><div><div className="eyebrow">Latest from the marketplace</div><h2 className="section-title">Recently published</h2></div><Link href="/explore" className="text-link">Explore all <ArrowRight size={14} style={{verticalAlign:'middle'}}/></Link></div>
          {listings.length ? <div className="listing-grid">{listings.map(listing=><ListingCard listing={listing} key={listing.id}/>)}</div> : <div className="empty-state"><strong>No active listings yet</strong>{db?'When an eligible listing is approved, it will appear here.':'Connect Supabase to browse live marketplace listings.'}</div>}
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-heading"><div><div className="eyebrow">A simple place to begin</div><h2 className="section-title">From discovery to a direct conversation</h2></div><Link href="/how-it-works" className="text-link">How it works <ArrowRight size={14} style={{verticalAlign:'middle'}}/></Link></div>
          <div className="category-grid steps-grid"><article className="panel step-card"><span className="step-number">01</span><h3>Explore</h3><p>Search listings and review the details shared by each owner.</p></article><article className="panel step-card"><span className="step-number">02</span><h3>Connect</h3><p>Ask questions through a private Ownly conversation.</p></article><article className="panel step-card"><span className="step-number">03</span><h3>Verify</h3><p>Confirm the transfer is permitted and agree the handover terms.</p></article><article className="panel step-card"><span className="step-number">04</span><h3>Proceed carefully</h3><p>Ownly does not currently process purchases or hold funds.</p></article></div>
        </div>
      </section>

      <section className="wrap safety-section"><div className="panel trust-panel"><ShieldCheck size={21}/><div><strong>Know what can be transferred.</strong><p>Only list assets you own or are authorized to transfer. Platform terms and local rules apply. Never share passwords, recovery codes, or access tokens.</p></div><Link href="/policies" className="text-link safety-link">Safety policies <ArrowRight size={14}/></Link></div></section>
    </main>
    <footer className="site-footer"><div className="wrap footer-inner"><span className="footer-copy">© {new Date().getFullYear()} Ownly</span><Link href="/policies">Policies</Link><Link href="/how-it-works">How it works</Link><Link href="/explore">Explore</Link></div></footer>
  </>;
}
