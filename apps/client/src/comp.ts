import type { Cycle, Employee, RecommendationMap } from './types.js';
import { getEligibility } from './utils.js';

export function roundTo(value: number, decimals = 2): number {
  const p = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * p) / p;
}

export type BudgetSnapshot = {
  eligiblePayroll: number;
  payrollBasis: number;
  meritBudgetTotal: number;
  bonusBudgetTotal: number;
  meritAllocated: number;
  bonusAllocated: number;
  avgMeritPct: number;
  pctUsed: number;
  remainingMeritBudget: number;
  eligibleCount: number;
};

export function getPayrollBasis(cycle: Cycle | null, eligiblePayroll: number) {
  const configuredPayroll = Number(cycle?.totalPayroll ?? 0);
  return configuredPayroll > 0 ? configuredPayroll : eligiblePayroll;
}

export function buildBudgetSnapshot(
  employees: Employee[],
  cycle: Cycle | null,
  recommendations: RecommendationMap
): BudgetSnapshot {
  const meritBudgetPct = Number(cycle?.meritBudgetPercent ?? cycle?.budgetPct ?? 3.5);
  const bonusBudgetPct = Number(cycle?.bonusBudgetPercent ?? 10);

  let eligiblePayroll = 0;
  let meritAllocated = 0;
  let bonusAllocated = 0;
  let eligibleCount = 0;
  let sumPct = 0;

  for (const e of employees) {
    const rec = recommendations[e.id];
    const eligibility = getEligibility(e.hireDate, cycle);
    const eligibleBase = e.salary * eligibility.eligibilityPercent;
    const useOverride =
      eligibility.ineligible && Boolean(cycle?.allowEligibilityOverride);
    const budgetBase = useOverride ? e.salary : eligibleBase;
    if (budgetBase > 0) eligibleCount += 1;
    eligiblePayroll += budgetBase;
    const pct = rec?.meritPct ?? 0;
    meritAllocated += budgetBase * (pct / 100);
    bonusAllocated +=
      rec?.bonusPayoutAmount && rec.bonusPayoutAmount > 0
        ? rec.bonusPayoutAmount
        : budgetBase * ((rec?.bonusPayoutPercent ?? 0) / 100);
    sumPct += pct;
  }

  const payrollBasis = getPayrollBasis(cycle, eligiblePayroll);
  const meritBudgetTotal =
    cycle?.budgetTotal && Number(cycle.budgetTotal) > 0
      ? Number(cycle.budgetTotal)
      : payrollBasis * (meritBudgetPct / 100);
  const bonusBudgetTotal = payrollBasis * (bonusBudgetPct / 100);
  const avgMeritPct = eligibleCount ? sumPct / eligibleCount : 0;
  const pctUsed = meritBudgetTotal ? meritAllocated / meritBudgetTotal : 0;

  return {
    eligiblePayroll: roundTo(eligiblePayroll),
    payrollBasis: roundTo(payrollBasis),
    meritBudgetTotal: roundTo(meritBudgetTotal),
    bonusBudgetTotal: roundTo(bonusBudgetTotal),
    meritAllocated: roundTo(meritAllocated),
    bonusAllocated: roundTo(bonusAllocated),
    avgMeritPct: roundTo(avgMeritPct),
    pctUsed,
    remainingMeritBudget: roundTo(meritBudgetTotal - meritAllocated),
    eligibleCount
  };
}
