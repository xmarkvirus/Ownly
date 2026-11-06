'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ListingGallery({ images }: { images: { url: string; alt: string }[] }) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  if (!images.length) return <div className="listing-art listing-gallery-empty" aria-label="No listing screenshots">No screenshots added</div>;
  const active = images[selected] ?? images[0];
  return <div className="listing-gallery">
    <button className="listing-gallery-main" type="button" onClick={() => setExpanded(true)} aria-label="Enlarge listing screenshot">
      <Image src={active.url} alt={active.alt} fill priority unoptimized sizes="(max-width: 800px) 100vw, 760px"/>
      <span className="gallery-expand-label">Enlarge</span>
    </button>
    {images.length > 1 && <div className="listing-gallery-thumbnails" role="list" aria-label="Listing screenshots">{images.map((image, index) => <button type="button" key={image.url} className={`gallery-thumbnail${index === selected ? ' is-selected' : ''}`} onClick={() => setSelected(index)} aria-label={`Show screenshot ${index + 1}`} aria-pressed={index === selected}><Image src={image.url} alt="" fill unoptimized sizes="100px"/></button>)}</div>}
    {expanded && <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Listing screenshot viewer" onClick={() => setExpanded(false)}><button type="button" className="gallery-close" aria-label="Close screenshot viewer">×</button><Image src={active.url} alt={active.alt} width={1400} height={1000} unoptimized onClick={(event) => event.stopPropagation()}/>{images.length > 1 && <div className="gallery-lightbox-controls" onClick={(event) => event.stopPropagation()}><button className="btn btn-secondary" type="button" onClick={() => setSelected((selected - 1 + images.length) % images.length)}>Previous</button><span>{selected + 1} / {images.length}</span><button className="btn btn-secondary" type="button" onClick={() => setSelected((selected + 1) % images.length)}>Next</button></div>}</div>}
  </div>;
}
