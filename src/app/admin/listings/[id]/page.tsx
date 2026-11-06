import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatMinorCurrency } from '@/lib/marketplace';
import { firstRelation } from '@/lib/supabase/relations';
import { moderateListing, permanentlyDeleteListing, setAdminListingStatus, updateAdminListing } from '@/app/actions';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { ListingGallery } from '@/components/listing-gallery';

export default async function AdminListingDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { id } = await params;
  const { error, updated } = await searchParams;
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (!role) redirect('/dashboard');
  const { data: listing } = await db.from('listings')
    .select('*,categories!listings_category_id_fkey(id,name,allowed_modes,active),profiles!listings_seller_id_fkey(display_name,bio,created_at,avatar_path)')
    .eq('id', id).maybeSingle();
  if (!listing) notFound();
  const [{ data: history }, { data: categories }, { data: images }] = await Promise.all([
    db.from('admin_audit_logs').select('id,actor_id,action,reason,created_at').eq('target_type', 'listing').eq('target_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('categories').select('id,name').eq('active', true).order('name'),
    db.from('listing_images').select('storage_path,alt_text,position').eq('listing_id', id).order('position'),
  ]);
  const paths = (images ?? []).map((image) => image.storage_path);
  const signed = paths.length ? await db.storage.from('ownly-listing-images').createSignedUrls(paths, 300) : { data: [] };
  const gallery = (images ?? []).flatMap((image, index) => signed.data?.[index]?.signedUrl ? [{ url: signed.data[index].signedUrl, alt: image.alt_text || `${listing.title} screenshot ${index + 1}` }] : []);
  const category = firstRelation(listing.categories);
  const seller = firstRelation(listing.profiles);

  return <>
    <div className="eyebrow">Listing review</div><h1 className="page-title">{listing.title}</h1>
    <p><span className={`status status-${listing.status}`}>{listing.status.replace('_', ' ')}</span></p>
    {updated && <p className="alert alert-success" role="status">Listing changes saved.</p>}
    {error && <p className="alert alert-error" role="alert">The action could not be completed ({error}). Check the reason and database migration status.</p>}
    <div className="detail-layout">
      <section className="panel detail-main">
        <h2>Listing details</h2>
        <ListingGallery images={gallery}/>
        <p><strong>Description</strong></p><p className="detail-description">{listing.description}</p>
        <p><strong>Price:</strong> {formatMinorCurrency(listing.price_minor, listing.currency)}</p>
        <p><strong>Category:</strong> {category?.name ?? 'Unknown'} · <strong>Mode:</strong> {listing.transaction_mode}</p>
        <p><strong>Authorization acknowledged:</strong> {listing.seller_authorized ? 'Yes' : 'No'} · <strong>Rules accepted:</strong> {listing.rules_accepted ? 'Yes' : 'No'}</p>
        {listing.attributes && Object.keys(listing.attributes).length > 0 && <><h3>Listing attributes</h3><dl>{Object.entries(listing.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></>}
        <p><strong>Submitted:</strong> {new Date(listing.created_at).toLocaleString()}</p>
        {listing.moderation_note && <p><strong>Current moderation note:</strong> {listing.moderation_note}</p>}
        <h2>Seller</h2>
        <p><Link className="text-link" href={`/profile/${listing.seller_id}`}>{seller?.display_name ?? 'Ownly member'}</Link></p>
        <p className="muted">{listing.seller_id} · Joined {seller?.created_at ? new Date(seller.created_at).toLocaleDateString() : 'unknown'}</p>
        {seller?.bio && <p>{seller.bio}</p>}
        <Link href={`/admin/users/${listing.seller_id}`} className="btn btn-secondary">View account</Link>
      </section>
      <aside className="panel detail-sidebar">
        <h2>Moderation actions</h2>
          <form action={moderateListing} className="auth-form"><input type="hidden" name="listing_id" value={id}/><label>Reason<input className="field" name="reason" minLength={5} maxLength={1000} required/></label><div className="admin-actions"><button className="btn" name="status" value="active">Approve / restore</button><button className="btn btn-secondary" name="status" value="rejected">Reject</button><ConfirmSubmitButton className="btn btn-danger" name="status" value="removed" confirmation="Remove this listing from the public marketplace?">Remove</ConfirmSubmitButton></div></form>
        {role.role === 'admin' && <>
          <h3>Availability</h3>
          <form action={setAdminListingStatus} className="auth-form"><input type="hidden" name="listing_id" value={id}/><label>Reason<input className="field" name="reason" minLength={5} maxLength={1000} required/></label><div className="admin-actions"><button className="btn btn-secondary" name="status" value="paused">Pause</button><button className="btn btn-secondary" name="status" value="active">Reactivate</button><button className="btn btn-secondary" name="status" value="archived">Archive</button></div></form>
          <h3>Edit listing information</h3>
          <form action={updateAdminListing} className="auth-form"><input type="hidden" name="listing_id" value={id}/><label>Title<input className="field" name="title" minLength={8} maxLength={100} required defaultValue={listing.title}/></label><label>Description<textarea className="field" name="description" minLength={30} maxLength={5000} rows={6} required defaultValue={listing.description}/></label><label>Category<select className="field" name="category_id" defaultValue={listing.category_id}>{categories?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Price<input className="field" name="price" type="number" min="0" max="1000000" step="0.01" required defaultValue={(listing.price_minor / 100).toFixed(2)}/></label><label>Currency<select className="field" name="currency" defaultValue={listing.currency}><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option></select></label><label>Transaction mode<select className="field" name="transaction_mode" defaultValue={listing.transaction_mode}><option value="DIRECT">Direct inquiry</option><option value="ON_SITE">On-site</option></select></label><label>Reason<input className="field" name="reason" minLength={5} maxLength={1000} required/></label><button className="btn">Save listing edits</button></form>
          <h3>Permanent deletion</h3><p className="muted">This permanently deletes the listing and cascades its associated conversations, messages, reports, and favorites. The audit record is retained.</p><form action={permanentlyDeleteListing} className="auth-form"><input type="hidden" name="listing_id" value={id}/><label>Deletion reason<input className="field" name="reason" minLength={10} maxLength={1000} required/></label><ConfirmSubmitButton className="btn btn-danger" confirmation={`Permanently delete “${listing.title}” and its related marketplace data?`}>Permanently delete listing</ConfirmSubmitButton></form>
        </>}
      </aside>
    </div>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Moderation history</h2>{history?.length ? history.map((entry) => <article key={entry.id} className="admin-row"><div className="admin-listing-info"><strong>{entry.action}</strong><span className="muted">{entry.reason}</span><span className="subtle">By {entry.actor_id}</span></div><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></article>) : <div className="empty-state">No moderation actions have been recorded.</div>}</section>
  </>;
}
