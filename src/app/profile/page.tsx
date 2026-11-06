import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AvatarPicker } from '@/components/avatar-picker';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { removeProfileAvatar, signOut, updateAccountEmail, updateProfile, updateSellerPayPalEmail } from '@/app/actions';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { PendingSubmitButton } from '@/components/pending-submit-button';

type Params = { updated?: string; payout?: string; error?: string; 'email-verification'?: string };

export default async function MyProfile({ searchParams }: { searchParams: Promise<Params> }) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: profile }, { data: payoutDetails }] = await Promise.all([
    db.from('profiles').select('display_name,bio,avatar_path,created_at').eq('id', user.id).maybeSingle(),
    db.from('seller_payment_details').select('paypal_email').eq('seller_id', user.id).maybeSingle(),
  ]);
  if (!profile) redirect('/login');
  const params = await searchParams;
  const avatarUrl = profile.avatar_path ? db.storage.from('ownly-avatars').getPublicUrl(profile.avatar_path).data.publicUrl : null;

  return <><SiteHeader/><main className="wrap page page-narrow">
    <div className="eyebrow">Your account</div><h1 className="page-title">My profile</h1>
    {params.updated && <p className="alert alert-success" role="status">Profile saved.</p>}
    {params.payout && <p className="alert alert-success" role="status">Private payout details saved.</p>}
    {params['email-verification'] && <p className="alert alert-success" role="status">A verification message was sent to the new email address. It will not change until verified.</p>}
    {params.error && params.error !== 'payout' && <p className="alert alert-error" role="alert">Profile update failed ({params.error}). Check the fields and try again.</p>}
    {params.error === 'payout' && <p className="alert alert-error" role="alert">Enter a valid PayPal email address.</p>}
    <section className="panel dashboard-panel"><form action={updateProfile} className="auth-form" encType="multipart/form-data">
      <AvatarPicker initialUrl={avatarUrl} displayName={profile.display_name}/>
      {profile.avatar_path && <ConfirmSubmitButton formAction={removeProfileAvatar} className="btn btn-secondary" confirmation="Remove your current profile picture?">Remove profile picture</ConfirmSubmitButton>}
      <label>Display name<input className="field" name="display_name" required minLength={2} maxLength={60} defaultValue={profile.display_name}/></label>
      <label>Bio<textarea className="field" name="bio" rows={5} maxLength={2000} defaultValue={profile.bio}/></label>
      <p className="muted" style={{ fontSize: 12 }}>Member since {new Date(profile.created_at).toLocaleDateString()}. Your public profile shows your display name, bio, avatar and active listings.</p>
      <PendingSubmitButton pendingText="Saving profile…">Save profile</PendingSubmitButton>
    </form></section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Seller payout details</h2><p className="muted">Add the PayPal email where Ownly should send seller payouts. This is private and visible only to you and Ownly admins.</p><form action={updateSellerPayPalEmail} className="auth-form"><label>PayPal email<input className="field" type="email" name="paypal_email" required maxLength={254} autoComplete="email" defaultValue={payoutDetails?.paypal_email ?? ''}/></label><button className="btn btn-secondary">Save payout email</button></form></section>
    <section className="panel dashboard-panel" style={{ marginTop: 15 }}><h2>Account settings</h2><p><strong>Email:</strong> {user.email ?? 'Unavailable'} · {user.email_confirmed_at ? 'Verified' : 'Not verified'}</p><form action={updateAccountEmail} className="auth-form"><label>Change email<input className="field" name="email" type="email" required autoComplete="email"/></label><p className="muted" style={{ fontSize: 12 }}>Supabase will verify the new email before applying the change.</p><button className="btn btn-secondary">Send email change request</button></form><div className="admin-actions" style={{ marginTop: 16 }}><Link className="btn btn-secondary" href="/reset-password">Change password</Link><form action={signOut}><button className="btn btn-secondary">Log out</button></form><Link className="text-link" href={`/profile/${user.id}`}>View public profile</Link></div></section>
  </main></>;
}
