export type SupabaseConfig = {
  url: string;
  key: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || !key) return null;

  try {
    const parsedUrl = new URL(rawUrl);

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null;
    }

    // Supabase clients expect the project URL, not the PostgREST endpoint.
    if (parsedUrl.pathname.replace(/\/$/, '').toLowerCase() === '/rest/v1') {
      parsedUrl.pathname = '/';
    }

    parsedUrl.search = '';
    parsedUrl.hash = '';

    return { url: parsedUrl.toString().replace(/\/$/, ''), key };
  } catch {
    return null;
  }
}
