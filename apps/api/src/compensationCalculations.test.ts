import { describe, expect, it } from 'vitest';
import { calculateCompensationOutputs } from './compensationCalculations.js';

describe('calculateCompensationOutputs', () => {
  it('is null-safe and returns gap flags instead of throwing', () => {
    const result = calculateCompensationOutputs({
      salary: null,
      rangeMid: null,
      newRangeMid: null,
      bonusTargetPercent: null,
      meritIncreaseAmount: null,
      meritIncreasePercent: null,
      recommendedMeritAmount: null,
      recommendedMeritPercent: null,
      promotionIncreaseAmount: null,
      bonusOverrideAmount: null,
      bonusOverridePercent: null,
      bonusWeightCompany: null,
      bonusWeightIndividual: null,
      goalAttainmentCompany: null,
      goalAttainmentIndividual: null
    });

    expect(result.salaryAfterMerit).toBeNull();
    expect(result.finalTotalBonusProrated).toBeNull();
    expect(result.gapFlags).toContain('missing_salary');
    expect(result.missingDataReasons.length).toBeGreaterThan(0);
  });

  it('computes values when all required inputs exist', () => {
    const result = calculateCompensationOutputs({
      salary: 100000,
      rangeMid: 110000,
      newRangeMid: 120000,
      bonusTargetPercent: 10,
      meritIncreaseAmount: null,
      meritIncreasePercent: 3,
      recommendedMeritAmount: 2500,
      recommendedMeritPercent: null,
      promotionIncreaseAmount: 5000,
      bonusOverrideAmount: null,
      bonusOverridePercent: 12,
      bonusWeightCompany: 0.4,
      bonusWeightIndividual: 0.6,
      goalAttainmentCompany: 80,
      goalAttainmentIndividual: 90
    });

    expect(result.compaRatio).toBeCloseTo(0.909091, 5);
    expect(result.salaryAfterMerit).toBe(103000);
    expect(result.finalSalaryWithPromo).toBe(108000);
    expect(result.finalTotalBonusProrated).toBe(11145.6);
    expect(result.newRangeCompaRatio).toBe(0.9);
    expect(result.varianceFromRecommendation).toBe(500);
  });

  it('missing salary produces blank salary outputs plus gap flag', () => {
    const result = calculateCompensationOutputs({
      salary: null,
      rangeMid: 100000,
      newRangeMid: 100000,
      bonusTargetPercent: 10,
      meritIncreaseAmount: 5000,
      meritIncreasePercent: null,
      recommendedMeritAmount: null,
      recommendedMeritPercent: 2,
      promotionIncreaseAmount: 2000,
      bonusOverrideAmount: null,
      bonusOverridePercent: null,
      bonusWeightCompany: 0.5,
      bonusWeightIndividual: 0.5,
      goalAttainmentCompany: 100,
      goalAttainmentIndividual: 100
    });

    expect(result.salaryAfterMerit).toBeNull();
    expect(result.currentBonusTargetAmount).toBeNull();
    expect(result.gapFlags).toContain('missing_salary');
  });
});
