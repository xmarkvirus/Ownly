import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { updateListing } from '@/app/actions';
import { ListingImageManager } from '@/components/listing-image-manager';
import { createClient } from '@/lib/supabase/server';
import { formatMinorCurrency } from '@/lib/marketplace';
import { firstRelation } from '@/lib/supabase/relations';
import { PendingSubmitButton } from '@/components/pending-submit-button';

export default async function EditListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: listing }, { data: images }] = await Promise.all([
    db.from('listings').select('id,title,description,price_minor,currency,status,category_id,categories!listings_category_id_fkey(name)').eq('id', id).eq('seller_id', user.id).maybeSingle(),
    db.from('listing_images').select('storage_path,position').eq('listing_id', id).order('position'),
  ]);
  if (!listing) notFound();
  const paths = (images ?? []).map((image) => image.storage_path);
  const signed = paths.length ? await db.storage.from('ownly-listing-images').createSignedUrls(paths, 300) : { data: [] };
  const existingImages = (images ?? []).map((image, index) => ({ path: image.storage_path, url: signed.data?.[index]?.signedUrl ?? '' })).filter((image) => image.url);

  return <><SiteHeader/><main className="wrap page page-narrow">
    <div className="eyebrow">Seller workspace</div><h1 className="page-title">Edit listing</h1>
    <p className="body-copy">Changes return an active listing to moderation. You can reorder or remove screenshots here.</p>
    {error && <p className="alert alert-error" role="alert">The listing or its screenshots could not be updated ({error}). Check the fields and try again.</p>}
    <form action={updateListing} encType="multipart/form-data" className="surface auth-form" style={{ maxWidth: 'none', padding: 24 }}>
      <input type="hidden" name="listing_id" value={listing.id}/>
      <div className="muted" style={{ fontSize: 12 }}>Category: {firstRelation(listing.categories)?.name ?? 'Digital property'} · Current price: {formatMinorCurrency(listing.price_minor, listing.currency)}</div>
      <label>Title<input className="field" name="title" required minLength={8} maxLength={100} defaultValue={listing.title}/></label>
      <label>Description<textarea className="field" name="description" required minLength={30} maxLength={5000} rows={7} defaultValue={listing.description}/></label>
      <ListingImageManager existing={existingImages} error={error}/>
      <label>Price<input className="field" name="price" type="number" min="0" step="0.01" required defaultValue={(listing.price_minor / 100).toFixed(2)}/></label>
      <label>Currency<input className="field" value={listing.currency} readOnly aria-readonly="true"/></label>
      <label className="check-row"><input name="authorized" type="checkbox" required defaultChecked/>I still own or am authorized to transfer this asset.</label>
      <label className="check-row"><input name="rules" type="checkbox" required defaultChecked/>I still agree to Ownly’s marketplace policies.</label>
      <p className="alert alert-warning" role="note">Make sure your screenshots do not expose passwords, recovery codes, private messages, personal information or other sensitive account details.</p>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><PendingSubmitButton pendingText="Uploading screenshots…">Save changes</PendingSubmitButton><Link className="btn btn-secondary" href="/dashboard">Cancel</Link></div>
    </form>
  </main></>;
}
