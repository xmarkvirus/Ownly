import { describe, expect, it } from 'vitest';
import { firstRelation } from './relations';

describe('firstRelation', () => {
  it('returns an object relation as-is', () => {
    expect(firstRelation({ name: 'Gaming' })).toEqual({ name: 'Gaming' });
  });

  it('returns the first item from an array relation', () => {
    expect(firstRelation([{ name: 'Gaming' }])).toEqual({ name: 'Gaming' });
  });

  it('returns null for missing or empty relations', () => {
    expect(firstRelation(null)).toBeNull();
    expect(firstRelation(undefined)).toBeNull();
    expect(firstRelation([])).toBeNull();
  });
});
