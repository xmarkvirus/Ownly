'use client';

import { useState, useTransition } from 'react';
import { setFavorite } from '@/app/actions';

export function FavoriteRemoveButton({ listingId, onRemoved }: { listingId: string; onRemoved: (id: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return <div>
    <button className="btn btn-secondary" disabled={pending} onClick={() => startTransition(async () => {
      const result = await setFavorite(listingId, false);
      if (result.ok) onRemoved(listingId); else setError(true);
    })}>{pending ? 'Removing…' : 'Remove saved listing'}</button>
    {error && <p className="alert alert-error" role="alert">Could not remove this listing. Please try again.</p>}
  </div>;
}
