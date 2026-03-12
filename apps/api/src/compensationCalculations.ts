export type CalculationInput = {
  salary: number | null;
  rangeMid: number | null;
  newRangeMid: number | null;
  bonusTargetPercent: number | null;
  meritIncreaseAmount: number | null;
  meritIncreasePercent: number | null;
  recommendedMeritAmount: number | null;
  recommendedMeritPercent: number | null;
  promotionIncreaseAmount: number | null;
  bonusOverrideAmount: number | null;
  bonusOverridePercent: number | null;
  bonusWeightCompany: number | null;
  bonusWeightIndividual: number | null;
  goalAttainmentCompany: number | null;
  goalAttainmentIndividual: number | null;
};

export type CalculationOutput = {
  compaRatio: number | null;
  salaryAfterMerit: number | null;
  finalSalaryWithPromo: number | null;
  currentBonusTargetAmount: number | null;
  finalCompanyBonusProrated: number | null;
  finalIndividualBonusProrated: number | null;
  finalTotalBonusProrated: number | null;
  newRangeCompaRatio: number | null;
  varianceFromRecommendation: number | null;
  gapFlags: string[];
  missingDataReasons: string[];
};

export function roundTo(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function addGap(flag: string, reason: string, gapFlags: Set<string>, reasons: Set<string>) {
  gapFlags.add(flag);
  reasons.add(reason);
}

export function calculateCompensationOutputs(input: CalculationInput): CalculationOutput {
  const gapFlags = new Set<string>();
  const reasons = new Set<string>();

  const salary = input.salary;
  const rangeMid = input.rangeMid;
  const baseSalaryForMerit = salary;

  if (salary == null) {
    addGap('missing_salary', 'salary is required for salary and bonus calculations', gapFlags, reasons);
  }

  const compaRatio =
    salary != null && rangeMid != null && rangeMid > 0
      ? roundTo(salary / rangeMid, 6)
      : null;

  if (compaRatio == null) {
    if (rangeMid == null) {
      addGap('missing_range_mid', 'range_mid is required to compute compa_ratio', gapFlags, reasons);
    } else if (rangeMid <= 0) {
      addGap('invalid_range_mid', 'range_mid must be greater than zero', gapFlags, reasons);
    }
  }

  let resolvedMeritAmount: number | null = null;
  if (baseSalaryForMerit != null && input.meritIncreasePercent != null) {
    resolvedMeritAmount = roundTo(baseSalaryForMerit * (input.meritIncreasePercent / 100));
  } else if (input.meritIncreaseAmount != null) {
    resolvedMeritAmount = input.meritIncreaseAmount;
  }

  if (resolvedMeritAmount == null) {
    addGap(
      'missing_merit_input',
      'merit increase amount or merit increase percent with salary is required',
      gapFlags,
      reasons
    );
  }

  const salaryAfterMerit =
    salary != null && resolvedMeritAmount != null ? roundTo(salary + resolvedMeritAmount) : null;

  const finalSalaryWithPromo =
    salaryAfterMerit != null
      ? roundTo(salaryAfterMerit + (input.promotionIncreaseAmount ?? 0))
      : null;

  if (salaryAfterMerit == null) {
    addGap('missing_salary_after_merit', 'salary_after_merit is unavailable due to missing inputs', gapFlags, reasons);
  }

  const bonusBaseSalary = finalSalaryWithPromo;

  const currentBonusTargetAmount =
    salary != null && input.bonusTargetPercent != null
      ? roundTo(salary * (input.bonusTargetPercent / 100))
      : null;

  if (currentBonusTargetAmount == null) {
    addGap(
      'missing_bonus_target',
      'salary and bonus_target_percent are required for current bonus target amount',
      gapFlags,
      reasons
    );
  }

  const effectiveBonusTargetAmount =
    input.bonusOverrideAmount ??
    (bonusBaseSalary != null && input.bonusOverridePercent != null
      ? roundTo(bonusBaseSalary * (input.bonusOverridePercent / 100))
      : currentBonusTargetAmount);

  const companyWeight = input.bonusWeightCompany ?? 0.5;
  const individualWeight = input.bonusWeightIndividual ?? 0.5;
  const companyGoal = input.goalAttainmentCompany;
  const individualGoal = input.goalAttainmentIndividual;

  const finalCompanyBonusProrated =
    effectiveBonusTargetAmount != null && companyGoal != null
      ? roundTo(effectiveBonusTargetAmount * companyWeight * (companyGoal / 100))
      : null;

  const finalIndividualBonusProrated =
    effectiveBonusTargetAmount != null && individualGoal != null
      ? roundTo(effectiveBonusTargetAmount * individualWeight * (individualGoal / 100))
      : null;

  if (finalCompanyBonusProrated == null) {
    addGap(
      'missing_company_bonus_input',
      'bonus target amount and company goal attainment are required for company bonus',
      gapFlags,
      reasons
    );
  }

  if (finalIndividualBonusProrated == null) {
    addGap(
      'missing_individual_bonus_input',
      'bonus target amount and individual goal attainment are required for individual bonus',
      gapFlags,
      reasons
    );
  }

  const finalTotalBonusProrated =
    finalCompanyBonusProrated != null && finalIndividualBonusProrated != null
      ? roundTo(finalCompanyBonusProrated + finalIndividualBonusProrated)
      : null;

  const newRangeCompaRatio =
    finalSalaryWithPromo != null && input.newRangeMid != null && input.newRangeMid > 0
      ? roundTo(finalSalaryWithPromo / input.newRangeMid, 6)
      : null;

  if (newRangeCompaRatio == null) {
    if (input.newRangeMid == null) {
      addGap('missing_new_range_mid', 'new range mid is required to compute new range compa ratio', gapFlags, reasons);
    } else if (input.newRangeMid <= 0) {
      addGap('invalid_new_range_mid', 'new range mid must be greater than zero', gapFlags, reasons);
    }
  }

  let resolvedRecommendationAmount: number | null = null;
  if (salary != null && input.recommendedMeritPercent != null) {
    resolvedRecommendationAmount = roundTo(salary * (input.recommendedMeritPercent / 100));
  } else if (input.recommendedMeritAmount != null) {
    resolvedRecommendationAmount = input.recommendedMeritAmount;
  }

  const varianceFromRecommendation =
    resolvedMeritAmount != null && resolvedRecommendationAmount != null
      ? roundTo(resolvedMeritAmount - resolvedRecommendationAmount)
      : null;

  if (varianceFromRecommendation == null) {
    addGap(
      'missing_recommendation_comparison',
      'both merit and recommendation inputs are required to compute variance',
      gapFlags,
      reasons
    );
  }

  return {
    compaRatio,
    salaryAfterMerit,
    finalSalaryWithPromo,
    currentBonusTargetAmount,
    finalCompanyBonusProrated,
    finalIndividualBonusProrated,
    finalTotalBonusProrated,
    newRangeCompaRatio,
    varianceFromRecommendation,
    gapFlags: [...gapFlags],
    missingDataReasons: [...reasons]
  };
}
