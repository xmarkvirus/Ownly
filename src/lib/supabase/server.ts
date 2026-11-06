import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';

export async function createClient() {
  const jar = await cookies();
  const config = getSupabaseConfig();
  if (!config) return null;
  const { url, key } = config;
  const setAll: SetAllCookies = (items) => {
    try {
      items.forEach(({ name, value, options }) => jar.set(name, value, options));
    } catch {
      // Server components cannot write cookies; middleware refreshes the session.
    }
  };

  return createServerClient(url, key, {
    cookies: { getAll: () => jar.getAll(), setAll },
  });
}
