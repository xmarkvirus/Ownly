import { describe, expect, it } from 'vitest';
import { detectImageMime, LISTING_SCREENSHOT_MAX_BYTES, LISTING_SCREENSHOT_MAX_COUNT } from './image-validation';

describe('listing screenshot validation', () => {
  it('recognizes PNG, JPEG and WebP signatures', () => {
    expect(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectImageMime(Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]))).toBe('image/webp');
  });

  it('rejects a filename or browser mime type without a matching image signature', () => {
    expect(detectImageMime(Uint8Array.from(Buffer.from('not an image')))).toBeNull();
  });

  it('caps listing screenshot size and count', () => {
    expect(LISTING_SCREENSHOT_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(LISTING_SCREENSHOT_MAX_COUNT).toBe(8);
  });
});
