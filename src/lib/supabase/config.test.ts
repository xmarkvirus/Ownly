import { afterEach, describe, expect, it } from 'vitest';
import { getSupabaseConfig } from './config';

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;

  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe('Supabase configuration', () => {
  it('normalizes a pasted REST endpoint to the project URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co/rest/v1/';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-placeholder';

    expect(getSupabaseConfig()).toEqual({
      url: 'https://project-ref.supabase.co',
      key: 'anon-key-placeholder',
    });
  });

  it('returns null when required configuration is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-placeholder';

    expect(getSupabaseConfig()).toBeNull();
  });

  it('rejects non-HTTP URLs', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'file:///rest/v1';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-placeholder';

    expect(getSupabaseConfig()).toBeNull();
  });
});
