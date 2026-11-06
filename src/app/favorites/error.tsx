'use client';

export default function FavoritesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="wrap page"><h1 className="page-title">Saved listings</h1><div className="alert alert-error" role="alert">Your saved listings could not be loaded.</div><button className="btn" onClick={() => reset()}>Try again</button></main>;
}
