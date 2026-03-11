import { describe, expect, it } from 'vitest';
import { findBestPayRange, type PayRangeRecord } from './payRanges.js';

const BASE_RANGE: PayRangeRecord = {
  id: 1,
  rangeName: 'Base',
  jobFamily: null,
  positionType: null,
  jobTitleReference: null,
  level: null,
  geography: null,
  geoTier: null,
  currency: 'USD',
  salaryMin: 80_000,
  salaryMid: 100_000,
  salaryMax: 120_000,
  effectiveDate: '2026-01-01',
  isActive: true
};

describe('findBestPayRange', () => {
  it('prefers most specific and most recent active range', () => {
    const ranges: PayRangeRecord[] = [
      {
        ...BASE_RANGE,
        id: 10,
        positionType: 'Engineer',
        geography: 'US',
        level: null,
        effectiveDate: '2025-01-01'
      },
      {
        ...BASE_RANGE,
        id: 11,
        positionType: 'Engineer',
        geography: 'US',
        level: 'L5',
        salaryMin: 90_000,
        salaryMid: 110_000,
        salaryMax: 140_000,
        effectiveDate: '2024-01-01'
      },
      {
        ...BASE_RANGE,
        id: 12,
        positionType: 'Engineer',
        geography: 'US',
        level: 'L5',
        salaryMin: 95_000,
        salaryMid: 120_000,
        salaryMax: 150_000,
        effectiveDate: '2026-01-01'
      }
    ];

    const result = findBestPayRange(
      {
        title: 'Senior Engineer',
        department: 'Engineering',
        positionType: 'Engineer',
        geography: 'US',
        level: 'L5',
        salary: 118_000
      },
      ranges
    );

    expect(result.payRangeId).toBe(12);
    expect(result.bandStatus).toBe('in_range');
    expect(result.matchedBy).toBe('position_type+geography');
  });

  it('falls back to no_range when there are no active matches', () => {
    const result = findBestPayRange(
      {
        title: 'Analyst',
        department: 'Finance',
        positionType: 'Analyst',
        geography: 'UK',
        level: 'L2',
        salary: 70_000
      },
      [{ ...BASE_RANGE, id: 99, isActive: false }]
    );

    expect(result.payRangeId).toBeNull();
    expect(result.bandStatus).toBe('no_range');
    expect(result.matchedBy).toBeNull();
  });

  it('clamps range penetration and compa values for out-of-band salaries', () => {
    const result = findBestPayRange(
      {
        title: 'Engineer',
        department: 'Engineering',
        positionType: 'Engineer',
        geography: 'US',
        level: 'L4',
        salary: 200_000
      },
      [{ ...BASE_RANGE, id: 21, positionType: 'Engineer' }]
    );

    expect(result.bandStatus).toBe('above_range');
    expect(result.compaRatio).toBe(2);
    expect(result.rangePenetration).toBe(1);
  });
});
