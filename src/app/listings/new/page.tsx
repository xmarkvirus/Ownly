import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { ListingImageManager } from '@/components/listing-image-manager';
import { createListing } from '@/app/actions';
import { PendingSubmitButton } from '@/components/pending-submit-button';

export default async function NewListing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: categories }, { data: restricted }, params] = await Promise.all([
    db.from('categories').select('id,name,allowed_modes').eq('active', true),
    db.rpc('is_restricted'), searchParams,
  ]);
  if (restricted) redirect('/dashboard');
  return <><SiteHeader/><main className="wrap page page-narrow">
    <div className="eyebrow">Seller workspace</div><h1 className="page-title">Create a listing</h1>
    <p className="body-copy">Submissions are reviewed before publication. Do not include passwords, recovery codes, or access tokens.</p>
    {params.error && <p className="alert alert-error" role="alert">We could not save your listing or screenshots ({params.error}). Check your inputs and try again.</p>}
    <form action={createListing} encType="multipart/form-data" className="surface auth-form" style={{ maxWidth: 'none', padding: 24 }}>
      <label>Title<input className="field" name="title" required minLength={8} maxLength={100}/></label>
      <label>Category<select className="field" name="category_id" required defaultValue=""><option value="" disabled>Select a category</option>{categories?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Description<textarea className="field" name="description" required minLength={30} maxLength={5000} rows={7}/></label>
      <ListingImageManager error={params.error}/>
      <div className="profile-form-grid"><label>Price<input className="field" name="price" type="number" min="0" step="0.01" required/></label><label>Currency<select className="field" name="currency" defaultValue="USD"><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option></select></label></div>
      <label>Transaction preference<select className="field" name="mode"><option value="DIRECT">Direct inquiry</option></select><span className="muted" style={{ fontSize: 12 }}>On-site purchases are unavailable while payment processing is being prepared.</span></label>
      <label className="check-row"><input name="authorized" type="checkbox" required/>I own or am authorized to transfer this asset and have checked the platform rules.</label>
      <label className="check-row"><input name="rules" type="checkbox" required/>I agree to Ownly’s marketplace policies.</label>
      <p className="alert alert-warning" role="note">Make sure your screenshots do not expose passwords, recovery codes, private messages, personal information or other sensitive account details.</p>
      <PendingSubmitButton pendingText="Uploading screenshots…">Submit for review</PendingSubmitButton>
    </form>
  </main></>;
}
