export default function FavoritesLoading() {
  return <main className="wrap page" aria-busy="true" aria-label="Loading saved listings"><div className="eyebrow">Your collection</div><h1 className="page-title">Saved listings</h1><div className="favorites-grid">{[0, 1, 2].map((item) => <div className="panel favorite-card favorite-skeleton" key={item}><div className="favorite-image"/><div className="favorite-content"><span className="skeleton-line"/><span className="skeleton-line short"/></div></div>)}</div></main>;
}
