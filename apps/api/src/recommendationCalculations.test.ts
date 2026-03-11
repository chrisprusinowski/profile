import { describe, expect, it } from 'vitest';

describe('recommendation calculations', () => {
  it('returns full eligibility when employee predates proration window and meets tenure', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/test';
    const { calculateEligibilityPercent } = await import(
      './recommendationCalculations.js'
    );

    const cycle = {
      effectiveDate: '2026-07-01',
      minTenureDays: 90,
      allowEligibilityOverride: false,
      enableProration: true,
      prorationStartDate: '2026-01-01',
      eligibilityCutoffDate: '2026-04-01'
    };

    expect(calculateEligibilityPercent('2025-01-15', cycle)).toBe(1);
  });

  it('returns zero when employee is below min tenure', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/test';
    const { calculateEligibilityPercent } = await import(
      './recommendationCalculations.js'
    );

    const cycle = {
      effectiveDate: '2026-07-01',
      minTenureDays: 90,
      allowEligibilityOverride: false,
      enableProration: true,
      prorationStartDate: '2026-01-01',
      eligibilityCutoffDate: '2026-04-01'
    };

    expect(calculateEligibilityPercent('2026-06-01', cycle)).toBe(0);
  });

  it('returns prorated eligibility inside proration window', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/test';
    const { calculateEligibilityPercent, roundTo } = await import(
      './recommendationCalculations.js'
    );

    const cycle = {
      effectiveDate: '2026-07-01',
      minTenureDays: 0,
      allowEligibilityOverride: false,
      enableProration: true,
      prorationStartDate: '2026-01-01',
      eligibilityCutoffDate: '2026-04-01'
    };

    expect(roundTo(calculateEligibilityPercent('2026-02-15', cycle), 4)).toBe(
      0.5
    );
  });
});
