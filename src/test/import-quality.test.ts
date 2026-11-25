import { describe, expect, it } from 'vitest';
import { importQualityReadiness } from '@/lib/import/quality-readiness';
describe('import review boundary', () => {
  it('rejects quality below 50 even with consent', () => {
    expect(importQualityReadiness(49, true)).toMatchObject({ rejected: true, ready: false });
  });
  it('requires explicit review consent from 50 through 74', () => {
    for (const quality of [50, 74]) {
      expect(importQualityReadiness(quality, false)).toMatchObject({ requiresReview: true, ready: false });
      expect(importQualityReadiness(quality, true).ready).toBe(true);
    }
  });
  it('accepts quality 75 without review and fails closed on invalid input', () => {
    expect(importQualityReadiness(75, false).ready).toBe(true);
    expect(importQualityReadiness(NaN, true).ready).toBe(false);
  });
});