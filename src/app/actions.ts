'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listingInput, permittedMode, sellerListingTransitionAllowed } from '@/lib/marketplace';
import { detectImageMime, LISTING_SCREENSHOT_MAX_BYTES, LISTING_SCREENSHOT_MAX_COUNT } from '@/lib/image-validation';
import { getPaymentProvider } from '@/lib/payments/provider';

export async function signIn(form:FormData){const db=await createClient();if(!db)redirect('/login?error=configuration');const email=String(form.get('email')??''),password=String(form.get('password')??'');const {error}=await db.auth.signInWithPassword({email,password});if(error)redirect('/login?error=credentials');redirect('/dashboard');}
export async function signUp(form:FormData){const db=await createClient();if(!db)redirect('/signup?error=configuration');const email=String(form.get('email')??''),password=String(form.get('password')??''),display_name=String(form.get('display_name')??'').trim();if(password.length<12||display_name.length<2)redirect('/signup?error=validation');const {error}=await db.auth.signUp({email,password,options:{data:{display_name},emailRedirectTo:`${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`}});if(error)redirect('/signup?error=signup');redirect('/login?message=verify');}
export async function signOut(){const db=await createClient();await db?.auth.signOut();redirect('/');}
export async function requestPasswordReset(form:FormData){const db=await createClient();if(!db)redirect('/reset-password?error=configuration');const email=String(form.get('email')??'');await db.auth.resetPasswordForEmail(email,{redirectTo:`${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`});redirect('/reset-password?sent=1');}
export async function changePassword(form:FormData){const db=await createClient();if(!db)redirect('/reset-password?error=configuration');const password=String(form.get('password')??'');if(password.length<12)redirect('/reset-password?error=validation');const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const {error}=await db.auth.updateUser({password});redirect(error?'/reset-password?error=update':'/dashboard?password=updated');}
export async function createListing(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/listings/new?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const price = String(form.get('price') ?? '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(price)) redirect('/listings/new?error=invalid');
  const [whole, fraction = ''] = price.split('.');
  const parsed = listingInput.safeParse({ title: form.get('title'), description: form.get('description'), category_id: form.get('category_id'), price_minor: Number(whole) * 100 + Number(fraction.padEnd(2, '0')), currency: form.get('currency'), transaction_mode: form.get('mode'), attributes: {}, seller_authorized: form.get('authorized') === 'on', rules_accepted: form.get('rules') === 'on' });
  if (!parsed.success) redirect('/listings/new?error=invalid');
  const { data: cat } = await db.from('categories').select('id,allowed_modes,active').eq('id', parsed.data.category_id).single();
  if (!cat || !cat.active || !permittedMode(parsed.data.transaction_mode, cat.allowed_modes)) redirect('/listings/new?error=policy');
  const { data: listing, error } = await db.from('listings').insert({ ...parsed.data, seller_id: user.id, status: 'pending_review' }).select('id').single();
  if (error || !listing) redirect('/listings/new?error=save');
  if (!await saveListingImages(db, user.id, listing.id, form)) redirect(`/listings/${listing.id}/edit?error=images`);
  revalidatePath('/dashboard');
  redirect('/dashboard?created=1');
}

async function saveListingImages(db: NonNullable<Awaited<ReturnType<typeof createClient>>>, userId: string, listingId: string, form: FormData): Promise<boolean> {
  const { data: ownedListing } = await db.from('listings').select('id').eq('id', listingId).eq('seller_id', userId).maybeSingle();
  if (!ownedListing) return false;
  const submitted = form.getAll('images').filter((file): file is File => file instanceof File && file.size > 0);
  const orderValue = String(form.get('image_order') ?? '');
  const order = orderValue ? orderValue.split('|').filter(Boolean) : [];
  const { data: current, error: currentError } = await db.from('listing_images').select('id,storage_path').eq('listing_id', listingId).order('position');
  const newIndexes = order.filter((value) => value.startsWith('new:')).map((value) => Number(value.slice(4)));
  if (currentError || submitted.length > LISTING_SCREENSHOT_MAX_COUNT || order.length > LISTING_SCREENSHOT_MAX_COUNT ||
    newIndexes.length !== submitted.length || new Set(newIndexes).size !== newIndexes.length ||
    newIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= submitted.length) ||
    order.some((value) => !value.startsWith('new:') && !value.startsWith('existing:'))) return false;
  const knownPaths = new Set((current ?? []).map((image) => image.storage_path));
  const existingOrder = order.filter((value) => value.startsWith('existing:')).map((value) => value.slice(9));
  if (existingOrder.some((path) => !knownPaths.has(path)) || new Set(existingOrder).size !== existingOrder.length) return false;
  const uploaded: string[] = [];
  const newByIndex = new Map<number, string>();
  for (let index = 0; index < submitted.length; index++) {
    const file = submitted[index];
    if (file.size > LISTING_SCREENSHOT_MAX_BYTES) return false;
    const mime = detectImageMime(new Uint8Array(await file.arrayBuffer()));
    if (!mime || mime !== file.type || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return false;
    const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    const path = `${listingId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage.from('ownly-listing-images').upload(path, file, { contentType: mime, upsert: false });
    if (error) {
      if (uploaded.length) {
        await db.from('listing_images').delete().eq('listing_id', listingId).in('storage_path', uploaded);
        await db.storage.from('ownly-listing-images').remove(uploaded);
      }
      return false;
    }
    uploaded.push(path); newByIndex.set(index, path);
  }
  const rows = order.map((value, position) => {
    if (value.startsWith('new:')) {
      const index = Number(value.slice(4));
      return { listing_id: listingId, storage_path: newByIndex.get(index), position, alt_text: 'Listing screenshot' };
    }
    const path = value.slice(9);
    return { listing_id: listingId, storage_path: path, position, alt_text: 'Listing screenshot' };
  });
  if (rows.some((row) => !row.storage_path)) {
    if (uploaded.length) await db.storage.from('ownly-listing-images').remove(uploaded);
    return false;
  }
  for (const row of rows) {
    const { error } = uploaded.includes(row.storage_path!)
      ? await db.from('listing_images').insert(row)
      : await db.from('listing_images').update({ position: row.position }).eq('listing_id', listingId).eq('storage_path', row.storage_path!);
    if (error) {
      if (uploaded.length) {
        await db.from('listing_images').delete().eq('listing_id', listingId).in('storage_path', uploaded);
        await db.storage.from('ownly-listing-images').remove(uploaded);
      }
      return false;
    }
  }
  const removed = (current ?? []).filter((image) => !existingOrder.includes(image.storage_path));
  if (removed.length) {
    const { error } = await db.from('listing_images').delete().eq('listing_id', listingId).in('storage_path', removed.map((image) => image.storage_path));
    if (error) return false;
    const { error: storageError } = await db.storage.from('ownly-listing-images').remove(removed.map((image) => image.storage_path));
    if (storageError) return false;
  }
  return true;
}
export async function updateListing(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const id = String(form.get('listing_id') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) redirect('/dashboard');

  const { data: existing } = await db.from('listings').select('category_id,transaction_mode,attributes,currency').eq('id', id).eq('seller_id', user.id).maybeSingle();
  if (!existing) redirect('/dashboard');
  const price = String(form.get('price') ?? '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(price)) redirect(`/listings/${id}/edit?error=validation`);
  const [whole, fraction = ''] = price.split('.');
  const parsed = listingInput.safeParse({
    title: form.get('title'),
    description: form.get('description'),
    category_id: existing.category_id,
    price_minor: Number(whole) * 100 + Number(fraction.padEnd(2, '0')),
    currency: existing.currency,
    transaction_mode: existing.transaction_mode,
    attributes: existing.attributes,
    seller_authorized: form.get('authorized') === 'on',
    rules_accepted: form.get('rules') === 'on',
  });
  if (!parsed.success) redirect(`/listings/${id}/edit?error=validation`);
  const { data: category } = await db.from('categories').select('id,allowed_modes,active').eq('id', existing.category_id).single();
  if (!category?.active || !permittedMode(existing.transaction_mode, category.allowed_modes)) redirect(`/listings/${id}/edit?error=policy`);

  const input = parsed.data;
  const { error } = await db.from('listings').update({
    title: input.title,
    description: input.description,
    price_minor: input.price_minor,
  }).eq('id', id).eq('seller_id', user.id);
  if (error) redirect(`/listings/${id}/edit?error=save`);
  if (!await saveListingImages(db, user.id, id, form)) redirect(`/listings/${id}/edit?error=images`);
  revalidatePath('/dashboard');
  revalidatePath('/explore');
  revalidatePath(`/listing/${id}`);
  revalidatePath(`/seller/${user.id}`);
  redirect('/dashboard?updated=1');
}

export async function updateListingStatus(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const id = String(form.get('listing_id') ?? '');
  const status = String(form.get('status') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !['active', 'paused'].includes(status)) {
    redirect('/dashboard?error=listing-status');
  }
  const { data: listing } = await db.from('listings').select('status').eq('id', id).eq('seller_id', user.id).maybeSingle();
  if (!listing || !sellerListingTransitionAllowed(listing.status, status)) {
    redirect('/dashboard?error=listing-status');
  }
  const { error } = await db.from('listings').update({ status }).eq('id', id).eq('seller_id', user.id);
  if (error) redirect('/dashboard?error=listing-status');
  revalidatePath('/dashboard');
  revalidatePath('/explore');
  revalidatePath(`/listing/${id}`);
  revalidatePath(`/seller/${user.id}`);
}
export async function setFavorite(listingId: string, saved: boolean): Promise<{ ok: boolean; saved: boolean }> {
  const db = await createClient();
  if (!db) return { ok: false, saved: !saved };
  const { data: { user } } = await db.auth.getUser();
  if (!user || !isUuid(listingId)) return { ok: false, saved: !saved };
  if (saved) {
    const { error } = await db.from('favorites').upsert({ user_id: user.id, listing_id: listingId }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
    if (error) return { ok: false, saved: false };
  } else {
    const { error } = await db.from('favorites').delete().eq('user_id', user.id).eq('listing_id', listingId);
    if (error) return { ok: false, saved: true };
  }
  revalidatePath('/favorites');
  revalidatePath('/dashboard');
  revalidatePath(`/listing/${listingId}`);
  return { ok: true, saved };
}

export async function startOrder(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const listingId = String(form.get('listing_id') ?? '');
  if (!isUuid(listingId)) redirect('/explore?error=listing');
  if (!getPaymentProvider()) redirect(`/listing/${listingId}?error=checkout`);
  const { data: orderId, error } = await db.rpc('create_order', { p_listing_id: listingId });
  if (error || !orderId) redirect(`/listing/${listingId}?error=order`);
  await startPaypalCheckout(db, orderId, user.id);
}

async function startPaypalCheckout(db: NonNullable<Awaited<ReturnType<typeof createClient>>>, orderId: string, buyerId: string) {
  const provider = getPaymentProvider();
  if (!provider) redirect(`/orders/${orderId}?paypal=unavailable`);
  const [{ data: order }, { data: payment }] = await Promise.all([
    db.from('orders').select('id,buyer_id,status,subtotal_minor,currency').eq('id', orderId).maybeSingle(),
    db.from('payments').select('status,provider,provider_reference').eq('order_id', orderId).maybeSingle(),
  ]);
  if (!order || order.buyer_id !== buyerId || order.status !== 'pending_payment' || !payment || payment.status !== 'pending') {
    redirect(`/orders/${orderId}?error=paypal`);
  }
  let checkoutUrl: string;
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) throw new Error('Site URL is missing.');
    const checkout = await provider.createCheckout({
      orderId,
      amountMinor: order.subtotal_minor,
      currency: order.currency.trim(),
      idempotencyKey: orderId,
      returnUrl: new URL(`/api/payments/paypal/return?order_id=${encodeURIComponent(orderId)}`, siteUrl).toString(),
    });
    const { error } = await db.rpc('attach_paypal_order', { p_order_id: orderId, p_paypal_order_id: checkout.providerReference });
    if (error) throw new Error('Could not attach PayPal order.');
    checkoutUrl = checkout.checkoutUrl;
  } catch {
    redirect(`/orders/${orderId}?error=paypal`);
  }
  redirect(checkoutUrl);
}

export async function retryPaypalCheckout(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const orderId = String(form.get('order_id') ?? '');
  if (!isUuid(orderId)) redirect('/orders');
  await startPaypalCheckout(db, orderId, user.id);
}

export async function deliverOrder(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const orderId = String(form.get('order_id') ?? '');
  const content = String(form.get('delivery_content') ?? '').trim();
  if (!isUuid(orderId) || content.length < 1 || content.length > 10000) redirect(`/orders/${orderId}?error=delivery`);
  const { error } = await db.rpc('deliver_order', { p_order_id: orderId, p_delivery_content: content });
  if (error) redirect(`/orders/${orderId}?error=delivery`);
  revalidatePath(`/orders/${orderId}`); revalidatePath('/orders');
  redirect(`/orders/${orderId}?delivered=1`);
}

export async function confirmOrderReceipt(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const orderId = String(form.get('order_id') ?? '');
  if (!isUuid(orderId)) redirect('/orders');
  const { error } = await db.rpc('confirm_order_receipt', { p_order_id: orderId });
  if (error) redirect(`/orders/${orderId}?error=confirm`);
  revalidatePath(`/orders/${orderId}`); revalidatePath('/orders');
  redirect(`/orders/${orderId}?completed=1`);
}

export async function reportOrderProblem(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const orderId = String(form.get('order_id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!isUuid(orderId) || reason.length < 10 || reason.length > 2000) redirect(`/orders/${orderId}?error=dispute`);
  const { error } = await db.rpc('open_order_dispute', { p_order_id: orderId, p_reason: reason });
  if (error) redirect(`/orders/${orderId}?error=dispute`);
  revalidatePath(`/orders/${orderId}`); revalidatePath('/orders');
  redirect(`/orders/${orderId}?disputed=1`);
}

export async function cancelPendingOrder(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const orderId = String(form.get('order_id') ?? '');
  if (!isUuid(orderId)) redirect('/orders');
  const { error } = await db.rpc('cancel_pending_order', { p_order_id: orderId });
  if (error) redirect(`/orders/${orderId}?error=cancel`);
  revalidatePath(`/orders/${orderId}`); revalidatePath('/orders');
  redirect(`/orders/${orderId}?cancelled=1`);
}

export async function setCommissionRate(form: FormData) {
  const { db } = await getAdminClient();
  const rate = String(form.get('commission_percent') ?? '').trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(rate)) redirect('/admin/settings?error=commission');
  const [whole, fraction = ''] = rate.split('.');
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (basisPoints > 2500) redirect('/admin/settings?error=commission');
  const { error } = await db.rpc('admin_set_commission_rate', { p_basis_points: basisPoints });
  if (error) redirect('/admin/settings?error=commission');
  revalidatePath('/admin/settings');
  redirect('/admin/settings?commission=updated');
}

export async function markSellerPayoutPaid(form: FormData) {
  const { db } = await getAdminClient();
  const payoutId = String(form.get('payout_id') ?? '');
  const providerReference = String(form.get('provider_reference') ?? '').trim();
  if (!isUuid(payoutId) || providerReference.length < 3 || providerReference.length > 128) {
    redirect('/admin/payouts?error=validation');
  }
  const { error } = await db.rpc('admin_mark_seller_payout_paid', {
    p_payout_id: payoutId,
    p_provider_reference: providerReference,
  });
  if (error) redirect('/admin/payouts?error=update');
  revalidatePath('/admin/payouts');
  revalidatePath('/orders');
  redirect('/admin/payouts?paid=1');
}

export async function updateSellerPayPalEmail(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const email = String(form.get('paypal_email') ?? '').trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/profile?error=payout');
  }
  const { error } = await db.from('seller_payment_details').upsert({ seller_id: user.id, paypal_email: email, updated_at: new Date().toISOString() }, { onConflict: 'seller_id' });
  if (error) redirect('/profile?error=payout');
  revalidatePath('/profile');
  revalidatePath('/admin/payouts');
  redirect('/profile?payout=updated');
}
export async function startConversation(form:FormData){const db=await createClient();if(!db)redirect('/login');const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const listing_id=String(form.get('listing_id')),body=String(form.get('message')??'').trim();if(body.length<1||body.length>4000)redirect(`/listing/${listing_id}?error=message`);const {data:l}=await db.from('listings').select('seller_id').eq('id',listing_id).eq('status','active').single();if(!l||l.seller_id===user.id)redirect(`/listing/${listing_id}?error=unavailable`);let {data:c}=await db.from('conversations').select('id').eq('listing_id',listing_id).eq('buyer_id',user.id).maybeSingle();if(!c){const {data:created,error}=await db.from('conversations').insert({listing_id,buyer_id:user.id,seller_id:l.seller_id}).select('id').single();if(error||!created)redirect(`/listing/${listing_id}?error=inquiry`);c=created;}const {error:messageError}=await db.from('messages').insert({conversation_id:c.id,sender_id:user.id,body});if(messageError)redirect(`/listing/${listing_id}?error=inquiry`);redirect(`/dashboard?conversation=${c.id}`);}
export async function moderateListing(form:FormData){const db=await createClient();if(!db)redirect('/login');const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const {data:role}=await db.from('user_roles').select('role').eq('user_id',user.id).maybeSingle();if(!role)redirect('/dashboard');const id=String(form.get('listing_id')),status=String(form.get('status')),reason=String(form.get('reason')??'').trim();if(!['active','rejected','removed'].includes(status)||reason.length<5)redirect('/admin?error=validation');const {error}=await db.from('listings').update({status,moderation_note:reason,published_at:status==='active'?new Date().toISOString():null}).eq('id',id);if(error)redirect('/admin?error=update');revalidatePath('/admin');revalidatePath('/admin/listings');revalidatePath('/explore');}
async function getStaffClient() {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (!role) redirect('/dashboard');
  return { db, user, role: role.role };
}

async function getAdminClient() {
  const context = await getStaffClient();
  if (context.role !== 'admin') redirect('/admin?error=authorization');
  return context;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function updateAdminListing(form: FormData) {
  const { db } = await getAdminClient();
  const id = String(form.get('listing_id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  const price = String(form.get('price') ?? '');
  if (!isUuid(id) || reason.length < 5 || reason.length > 1000 || !/^\d{1,8}(\.\d{1,2})?$/.test(price)) redirect(`/admin/listings/${id}?error=validation`);
  const { data: existing } = await db.from('listings').select('attributes,seller_authorized,rules_accepted').eq('id', id).maybeSingle();
  if (!existing) redirect('/admin/listings?error=not-found');
  const [whole, fraction = ''] = price.split('.');
  const parsed = listingInput.safeParse({
    title: form.get('title'), description: form.get('description'), category_id: form.get('category_id'),
    price_minor: Number(whole) * 100 + Number(fraction.padEnd(2, '0')), currency: form.get('currency'),
    transaction_mode: form.get('transaction_mode'), attributes: existing.attributes,
    seller_authorized: existing.seller_authorized, rules_accepted: existing.rules_accepted,
  });
  if (!parsed.success) redirect(`/admin/listings/${id}?error=validation`);
  const { data: category } = await db.from('categories').select('id,allowed_modes,active').eq('id', parsed.data.category_id).single();
  if (!category?.active || !permittedMode(parsed.data.transaction_mode, category.allowed_modes)) redirect(`/admin/listings/${id}?error=policy`);
  const { error } = await db.from('listings').update({
    title: parsed.data.title, description: parsed.data.description,
    category_id: parsed.data.category_id, price_minor: parsed.data.price_minor,
    currency: parsed.data.currency, transaction_mode: parsed.data.transaction_mode,
    moderation_note: reason,
  }).eq('id', id);
  if (error) redirect(`/admin/listings/${id}?error=update`);
  revalidatePath('/admin'); revalidatePath('/admin/listings'); revalidatePath(`/admin/listings/${id}`); revalidatePath('/explore');
  redirect(`/admin/listings/${id}?updated=1`);
}

export async function setAdminListingStatus(form: FormData) {
  const { db } = await getAdminClient();
  const id = String(form.get('listing_id') ?? '');
  const status = String(form.get('status') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!isUuid(id) || !['paused', 'active', 'unavailable', 'archived'].includes(status) || reason.length < 5 || reason.length > 1000) redirect(`/admin/listings/${id}?error=validation`);
  const { data: listing } = await db.from('listings').select('published_at').eq('id', id).maybeSingle();
  if (!listing) redirect('/admin/listings?error=not-found');
  const { error } = await db.from('listings').update({
    status, moderation_note: reason,
    published_at: status === 'active' ? listing.published_at ?? new Date().toISOString() : listing.published_at,
  }).eq('id', id);
  if (error) redirect(`/admin/listings/${id}?error=update`);
  revalidatePath('/admin'); revalidatePath('/admin/listings'); revalidatePath(`/admin/listings/${id}`); revalidatePath('/explore');
  redirect(`/admin/listings/${id}?updated=1`);
}

export async function permanentlyDeleteListing(form: FormData) {
  const { db } = await getAdminClient();
  const id = String(form.get('listing_id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!isUuid(id) || reason.length < 10 || reason.length > 1000) redirect(`/admin/listings/${id}?error=validation`);
  const { error } = await db.rpc('admin_delete_listing', { p_listing_id: id, p_reason: reason });
  if (error) redirect(`/admin/listings/${id}?error=delete`);
  revalidatePath('/admin'); revalidatePath('/admin/listings'); revalidatePath('/explore');
  redirect('/admin/listings?deleted=1');
}

export async function changeUserRole(form: FormData) {
  const { db } = await getAdminClient();
  const userId = String(form.get('user_id') ?? '');
  const nextRole = String(form.get('role') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!isUuid(userId) || !['admin', 'moderator', 'none'].includes(nextRole) || reason.length < 5 || reason.length > 1000) redirect('/admin/moderators?error=validation');
  const { error } = await db.rpc('admin_set_user_role', { p_user_id: userId, p_role: nextRole, p_reason: reason });
  if (error) redirect(`/admin/moderators?error=${error.code === '42501' ? 'authorization' : 'role'}`);
  revalidatePath('/admin'); revalidatePath('/admin/moderators'); revalidatePath('/admin/users');
  redirect('/admin/moderators?updated=1');
}

export async function updateProfile(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const displayName = String(form.get('display_name') ?? '').trim();
  const bio = String(form.get('bio') ?? '').trim();
  const file = form.get('avatar');
  if (displayName.length < 2 || displayName.length > 60 || bio.length > 2000) redirect('/profile?error=validation');
  let uploadedPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 3 * 1024 * 1024) redirect('/profile?error=avatar-size');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectImageMime(bytes);
    if (!mime || file.type !== mime) redirect('/profile?error=avatar-type');
    const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from('ownly-avatars').upload(uploadedPath, file, { contentType: mime, upsert: false });
    if (uploadError) redirect('/profile?error=avatar-upload');
  }
  const { data: profile } = await db.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle();
  const { error } = await db.from('profiles').update({ display_name: displayName, bio, ...(uploadedPath ? { avatar_path: uploadedPath } : {}) }).eq('id', user.id);
  if (error) {
    if (uploadedPath) await db.storage.from('ownly-avatars').remove([uploadedPath]);
    redirect('/profile?error=save');
  }
  if (uploadedPath && profile?.avatar_path) await db.storage.from('ownly-avatars').remove([profile.avatar_path]);
  revalidatePath('/profile'); revalidatePath(`/profile/${user.id}`); revalidatePath(`/seller/${user.id}`);
  redirect('/profile?updated=1');
}

export async function removeProfileAvatar() {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await db.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle();
  const { error } = await db.from('profiles').update({ avatar_path: null }).eq('id', user.id);
  if (error) redirect('/profile?error=avatar-remove');
  if (profile?.avatar_path) await db.storage.from('ownly-avatars').remove([profile.avatar_path]);
  revalidatePath('/profile'); revalidatePath(`/profile/${user.id}`); revalidatePath(`/seller/${user.id}`);
  redirect('/profile?updated=1');
}

export async function updateAccountEmail(form: FormData) {
  const db = await createClient();
  if (!db) redirect('/login?error=configuration');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect('/profile?error=email');
  const { error } = await db.auth.updateUser({ email });
  if (error) redirect('/profile?error=email');
  redirect('/profile?email-verification=sent');
}

export async function reviewReport(form: FormData) {
  const { db } = await getStaffClient();
  const id = String(form.get('report_id') ?? '');
  const status = String(form.get('status') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['reviewing', 'resolved', 'dismissed'].includes(status)) {
    redirect('/admin?error=validation');
  }

  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 5 || reason.length > 1000) redirect('/admin/reports?error=validation');
  const { error } = await db.rpc('admin_review_report', { p_report_id: id, p_status: status, p_reason: reason });
  if (error) redirect('/admin/reports?error=report');
  revalidatePath('/admin');
  revalidatePath('/admin/reports');
}

export async function restrictUser(form: FormData) {
  const { db, user, role } = await getStaffClient();
  if (role !== 'admin') redirect('/admin?error=authorization');
  const userId = String(form.get('user_id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || userId === user.id || reason.length < 5 || reason.length > 1000) {
    redirect('/admin?error=validation');
  }

  const { error } = await db.from('user_restrictions').upsert(
    { user_id: userId, reason, restricted_by: user.id },
    { onConflict: 'user_id' },
  );
  if (error) redirect('/admin?error=restriction');
  revalidatePath('/admin');
  revalidatePath('/admin/users');
}

export async function liftUserRestriction(form: FormData) {
  const { db, user, role } = await getStaffClient();
  if (role !== 'admin') redirect('/admin?error=authorization');
  const userId = String(form.get('user_id') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || userId === user.id) {
    redirect('/admin?error=validation');
  }

  const { data: restriction, error } = await db.from('user_restrictions').delete().eq('user_id', userId).select('user_id').maybeSingle();
  if (error || !restriction) redirect('/admin?error=restriction');
  revalidatePath('/admin');
  revalidatePath('/admin/users');
}
export async function sendMessage(form:FormData){const db=await createClient();if(!db)redirect('/login');const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const conversation_id=String(form.get('conversation_id')),body=String(form.get('body')??'').trim();if(!body||body.length>4000)redirect(`/inbox/${conversation_id}`);const {error}=await db.from('messages').insert({conversation_id,sender_id:user.id,body});if(error)redirect(`/inbox/${conversation_id}?error=send`);revalidatePath(`/inbox/${conversation_id}`);}
export async function createReport(form:FormData){const db=await createClient();if(!db)redirect('/login');const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const listing_id=String(form.get('listing_id')),reason=String(form.get('reason')??'').trim();if(reason.length<10||reason.length>2000)redirect(`/report?listing=${listing_id}&error=validation`);const {error}=await db.from('reports').insert({reporter_id:user.id,listing_id,reason});redirect(error?`/report?listing=${listing_id}&error=submit`:'/explore?reported=1');}
