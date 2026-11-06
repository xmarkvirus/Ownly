import { z } from 'zod';

export const listingInput = z.object({
  title: z.string().trim().min(8).max(100),
  description: z.string().trim().min(30).max(5000),
  category_id: z.string().uuid(),
  price_minor: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  transaction_mode: z.enum(['DIRECT','ON_SITE']),
  attributes: z.record(z.string(), z.unknown()).default({}),
  seller_authorized: z.literal(true),
  rules_accepted: z.literal(true),
});

export type TransactionMode = 'DIRECT' | 'ON_SITE' | 'DISABLED';

export function formatMinorCurrency(amountMinor: number, currency: string): string {
  const amount = amountMinor / 100;
  if (!/^[A-Z]{3}$/.test(currency)) return `${currency} ${amount.toFixed(2)}`;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function sellerListingTransitionAllowed(current: string, next: string): boolean {
  return (current === 'active' && next === 'paused') || (current === 'paused' && next === 'active');
}

export function permittedMode(requested: TransactionMode, allowed: TransactionMode[], globallyEnabled = process.env.ON_SITE_PURCHASES_ENABLED === 'true'): boolean {
  if (requested === 'DISABLED' || !allowed.includes(requested)) return false;
  return requested !== 'ON_SITE' || globallyEnabled;
}
