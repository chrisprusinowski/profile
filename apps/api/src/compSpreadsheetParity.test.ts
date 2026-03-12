import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateCompensationOutputs, roundTo } from './compensationCalculations.js';

type Fixture = {
  name: string;
  input: Parameters<typeof calculateCompensationOutputs>[0];
  expected: {
    meritAmount: number;
    meritPercent: number;
    proration: number;
    compaRatio: number;
    salaryAfterMerit: number;
    bonusTargetAmount: number;
    finalBonus: number;
    promotionAdjustedSalary: number;
  };
};

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/__fixtures__/compSpreadsheetParity.json'), 'utf-8')
) as Fixture[];

describe('spreadsheet parity fixtures', () => {
  it('matches expected historical spreadsheet outputs', () => {
    for (const testCase of fixture) {
      const out = calculateCompensationOutputs(testCase.input);
      const meritAmount = testCase.input.meritIncreasePercent != null
        ? roundTo((testCase.input.salary ?? 0) * (testCase.input.meritIncreasePercent / 100))
        : (testCase.input.meritIncreaseAmount ?? 0);

      expect(meritAmount, testCase.name).toBe(testCase.expected.meritAmount);
      expect(testCase.input.meritIncreasePercent ?? null, testCase.name).toBe(testCase.expected.meritPercent);
      expect(1, testCase.name).toBe(testCase.expected.proration);
      expect(out.compaRatio, testCase.name).toBe(testCase.expected.compaRatio);
      expect(out.salaryAfterMerit, testCase.name).toBe(testCase.expected.salaryAfterMerit);
      expect(out.currentBonusTargetAmount, testCase.name).toBe(testCase.expected.bonusTargetAmount);
      expect(out.finalTotalBonusProrated, testCase.name).toBe(testCase.expected.finalBonus);
      expect(out.finalSalaryWithPromo, testCase.name).toBe(testCase.expected.promotionAdjustedSalary);
    }
  });
});
