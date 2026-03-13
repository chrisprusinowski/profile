export interface EmployeePayRange {
  payRangeId: number | null;
  payRangeName: string | null;
  matchedRangeMin: number | null;
  matchedRangeMid: number | null;
  matchedRangeMax: number | null;
  matchedRangeCurrency: string | null;
  bandStatus: 'below_range' | 'in_range' | 'above_range' | 'no_range';
  compaRatio: number | null;
  rangePenetration: number | null;
  matchedBy?: string | null;
}

export interface Employee {
  id: string;
  name: string;
  email?: string;
  department?: string;
  title?: string;
  positionType?: string;
  geography?: string;
  level?: string;
  salary: number;
  manager?: string;
  managerEmail?: string;
  executiveName?: string;
  executiveEmail?: string;
  hireDate?: string;
  payRange?: EmployeePayRange;
}

export interface PayRange {
  id?: number;
  rangeName?: string | null;
  jobFamily?: string | null;
  positionType?: string | null;
  jobTitleReference?: string | null;
  level?: string | null;
  geography?: string | null;
  geoTier?: string | null;
  currency?: string | null;
  salaryMin: number;
  salaryMid: number;
  salaryMax: number;
  effectiveDate?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Recommendation {
  meritPct: number;
  performanceRating: 1 | 2 | 3;
  bonusTargetPercent?: number | null;
  bonusPayoutPercent: number;
  bonusPayoutAmount: number;
  notes: string;
  status: 'Draft' | 'Submitted' | 'Locked';
  meritAmount?: number;
  updatedBy?: string;
  submittedAt?: string;
  submittedBy?: string;
  lockedAt?: string;
  lockedBy?: string;
  updatedAt?: string;
}

export type RecommendationMap = Record<string, Recommendation>;

export interface Cycle {
  id?: number;
  name: string;
  type: string;
  openDate: string;
  closeDate: string;
  effectiveDate: string;
  totalPayroll: number;
  budgetPct: number;
  budgetTotal: number;
  guidelineMin: number;
  guidelineMax: number;
  meritBudgetPercent: number;
  bonusBudgetPercent: number;
  guidelineMaxPercent: number;
  minTenureDays: number;
  allowEligibilityOverride: boolean;
  enableProration: boolean;
  prorationStartDate: string;
  eligibilityCutoffDate: string;
  status: string;
}

export type AppRole = 'admin' | 'executive' | 'manager';

export interface AppUser {
  email: string;
  role: AppRole;
  executiveName?: string | null;
  executiveEmail?: string | null;
  isActive: boolean;
}

export interface CompensationCycle {
  id: number;
  name: string;
  status: string | null;
  cycleType: string | null;
  openDate: string | null;
  closeDate: string | null;
  effectiveDate: string | null;
}

export interface CompensationTotalSummaryRow {
  employeeId: string;
  importBatchId: number | null;
  importedFirstName: string | null;
  importedLastName: string | null;
  importedFullName: string | null;
  importedDepartment: string | null;
  importedTitle: string | null;
  importedSalary: number | null;
  importedRawAttributes: Record<string, unknown> | null;
  enteredCurrentPerformanceRating: string | null;
  enteredPriorPerformanceRating: string | null;
  enteredMeritIncreaseAmount: number | null;
  enteredMeritIncreasePercent: number | null;
  enteredRecommendedMeritAmount: number | null;
  enteredRecommendedMeritPercent: number | null;
  enteredVarianceFromRecommendation: number | null;
  enteredIsPromotion: boolean | null;
  enteredPromotionType: string | null;
  enteredNewJobTitle: string | null;
  enteredPromotionRationale: string | null;
  enteredPromotionIncreaseAmount: number | null;
  enteredBonusOverrideAmount: number | null;
  enteredBonusOverridePercent: number | null;
  enteredBonusWeightCompany: number | null;
  enteredBonusWeightIndividual: number | null;
  enteredGoalAttainmentCompany: number | null;
  enteredGoalAttainmentIndividual: number | null;
  enteredExecReview: string | null;
  enteredNotes: string | null;
  enteredPlanningStatus: PlannerWorkflowStatus | null;
  enteredPlannerInputs: Record<string, unknown> | null;
  derivedCompaRatio: number | null;
  derivedSalaryAfterMerit: number | null;
  derivedFinalSalaryWithPromo: number | null;
  derivedCurrentBonusTargetAmount: number | null;
  derivedFinalCompanyBonusProrated: number | null;
  derivedFinalIndividualBonusProrated: number | null;
  derivedFinalTotalBonusProrated: number | null;
  derivedNewRangeCompaRatio: number | null;
  derivedVarianceFromRecommendation: number | null;
  derivedGapFlags: string[] | null;
  derivedMissingDataReasons: string[] | null;
  derivedGeneratedAt: string | null;
}

export type PlannerWorkflowStatus =
  | 'not_started'
  | 'in_progress'
  | 'manager_submitted'
  | 'exec_reviewed'
  | 'finalized';

export interface PlannerAuditChange {
  id: number;
  cycleId: number;
  employeeId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

export interface EmployeeCyclePlanPayload {
  priorPerformanceRating: string | null;
  currentPerformanceRating: string | null;
  meritIncreaseAmount: number | null;
  meritIncreasePercent: number | null;
  recommendedMeritAmount: number | null;
  recommendedMeritPercent: number | null;
  varianceFromRecommendation: number | null;
  isPromotion: boolean | null;
  promotionType: string | null;
  newJobTitle: string | null;
  promotionRationale: string | null;
  promotionIncreaseAmount: number | null;
  bonusOverrideAmount: number | null;
  bonusOverridePercent: number | null;
  bonusWeightCompany: number | null;
  bonusWeightIndividual: number | null;
  goalAttainmentCompany: number | null;
  goalAttainmentIndividual: number | null;
  execReview: string | null;
  notes: string | null;
}
