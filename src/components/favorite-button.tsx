'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useState, useTransition } from 'react';
import { setFavorite } from '@/app/actions';

export function FavoriteButton({ listingId, initialSaved = false, signedIn = true, compact = false }: {
  listingId: string; initialSaved?: boolean; signedIn?: boolean; compact?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  if (!signedIn) return <Link className={compact ? 'favorite-control' : 'btn btn-secondary'} href="/login" aria-label="Log in to save this listing"><Heart size={15}/>{!compact && 'Save listing'}</Link>;
  return <><button type="button" className={compact ? 'favorite-control' : 'btn btn-secondary'} aria-label={saved ? 'Remove from favorites' : 'Save listing'} aria-pressed={saved} title={failed ? 'Could not update saved listings. Try again.' : undefined} disabled={pending}
    onClick={() => startTransition(async () => {
      const result = await setFavorite(listingId, !saved);
      if (result.ok) { setSaved(result.saved); setFailed(false); } else setFailed(true);
    })}>
    <Heart size={15} fill={saved ? 'currentColor' : 'none'}/>{!compact && (pending ? 'Saving…' : saved ? 'Saved to favorites' : 'Save listing')}
  </button>{failed && <span className="visually-hidden" role="alert">Could not update saved listings. Please try again.</span>}</>;
}
