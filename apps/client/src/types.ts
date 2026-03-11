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
  managerName?: string | null;
  managerEmail?: string | null;
  isActive: boolean;
}
