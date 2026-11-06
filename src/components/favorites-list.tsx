'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { FavoriteRemoveButton } from '@/components/favorite-remove-button';
import { formatMinorCurrency } from '@/lib/marketplace';

export type FavoriteItem = {
  id: string;
  title: string;
  status: string;
  price_minor: number;
  currency: string;
  image: string | null;
  seller: string;
};

export function FavoritesList({ items }: { items: FavoriteItem[] }) {
  const [rows, setRows] = useState(items);
  if (!rows.length) return <div className="empty-state"><strong>Your saved list is empty</strong>Save listings you want to come back to.<p><Link className="btn" href="/explore">Explore listings</Link></p></div>;
  return <div className="favorites-grid">{rows.map((item) => <article className="panel favorite-card" key={item.id}>
    {item.status === 'unavailable' ? <div className="favorite-image"><span>Listing unavailable</span></div> : <Link href={`/listing/${item.id}`} className="favorite-image">{item.image ? <Image src={item.image} alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 320px"/> : <span>Digital listing</span>}</Link>}
    <div className="favorite-content"><div className="listing-meta"><span>{item.seller}</span><span className={`status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></div>
      {item.status === 'unavailable' ? <h2 className="listing-title">{item.title}</h2> : <Link href={`/listing/${item.id}`}><h2 className="listing-title">{item.title}</h2></Link>}{item.status !== 'unavailable' && <strong className="listing-price">{formatMinorCurrency(item.price_minor, item.currency)}</strong>}
      <FavoriteRemoveButton listingId={item.id} onRemoved={(id) => setRows((current) => current.filter((row) => row.id !== id))}/>
    </div>
  </article>)}</div>;
}
