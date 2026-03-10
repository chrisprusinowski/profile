export interface Employee {
  id: string;
  name: string;
  email?: string;
  department?: string;
  title?: string;
  salary: number;
  manager?: string;
  hireDate?: string;
}

export interface Recommendation {
  meritPct: number;
  rating: string;
  notes: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Flagged';
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
  status: string;
}

export type AppRole = 'admin' | 'executive' | 'manager';

export interface AppUser {
  email: string;
  role: AppRole;
  managerName?: string | null;
  isActive: boolean;
}
