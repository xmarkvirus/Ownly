import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/** Server-only Supabase client for verified payment webhooks and capture reconciliation. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return createSupabaseClient(parsed.toString().replace(/\/$/, ''), key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch {
    return null;
  }
}
