import type {
  AppUser,
  Cycle,
  Employee,
  Recommendation,
  RecommendationMap,
  PayRange,
  CompensationCycle,
  CompensationTotalSummaryRow,
  EmployeeCyclePlanPayload,
  PlannerAuditChange,
  PlannerWorkflowStatus
} from '../types.js';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';
const LS_DEMO_USER_EMAIL = 'mc_demo_user_email';

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type CsvImportPreview = {
  rowsReceived: number;
  rowsValid: number;
  rowsInvalid: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
};

export type CsvImportResult = {
  rowsReceived: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsRejected: number;
};

export type PayRangeImportSummary = {
  processed: number;
  inserted: number;
  updated: number;
  rejected: number;
  validationErrors: Array<{ row: number; error: string }>;
};

export interface AppUserRecord extends AppUser {
  createdAt: string;
  updatedAt: string;
}

const LS_CYCLE = 'mc_cycle_v2';
const LS_RECS = 'mc_recommendations_v2';
const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;


function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.split('"').join('""')}"`;
  }
  return value;
}

export function buildCompensationTotalSummaryCsv(
  rows: CompensationTotalSummaryRow[]
): string {
  const columns: Array<keyof CompensationTotalSummaryRow> = [
    'employeeId',
    'importBatchId',
    'importedFirstName',
    'importedLastName',
    'importedFullName',
    'importedDepartment',
    'importedTitle',
    'importedSalary',
    'importedRawAttributes',
    'enteredCurrentPerformanceRating',
    'enteredPriorPerformanceRating',
    'enteredMeritIncreaseAmount',
    'enteredMeritIncreasePercent',
    'enteredRecommendedMeritAmount',
    'enteredRecommendedMeritPercent',
    'enteredVarianceFromRecommendation',
    'enteredIsPromotion',
    'enteredPromotionType',
    'enteredNewJobTitle',
    'enteredPromotionRationale',
    'enteredPromotionIncreaseAmount',
    'enteredBonusOverrideAmount',
    'enteredBonusOverridePercent',
    'enteredBonusWeightCompany',
    'enteredBonusWeightIndividual',
    'enteredGoalAttainmentCompany',
    'enteredGoalAttainmentIndividual',
    'enteredExecReview',
    'enteredNotes',
    'enteredPlanningStatus',
    'enteredPlannerInputs',
    'derivedCompaRatio',
    'derivedSalaryAfterMerit',
    'derivedFinalSalaryWithPromo',
    'derivedCurrentBonusTargetAmount',
    'derivedFinalCompanyBonusProrated',
    'derivedFinalIndividualBonusProrated',
    'derivedFinalTotalBonusProrated',
    'derivedNewRangeCompaRatio',
    'derivedVarianceFromRecommendation',
    'derivedGapFlags',
    'derivedMissingDataReasons',
    'derivedGeneratedAt'
  ];

  const header = columns.join(',');
  const body = rows
    .map((row) =>
      columns
        .map((column) => escapeCsv(toCsvValue(row[column])))
        .join(',')
    )
    .join('\n');

  return `${header}\n${body}`;
}

console.info('[api.client] configured API base URL', {
  apiBaseUrl: API_BASE || '(empty)'
});

const DEFAULT_CYCLE: Cycle = {
  name: '2026 Annual Merit Cycle',
  type: 'merit',
  openDate: '2026-03-01',
  closeDate: '2026-04-15',
  effectiveDate: '2026-07-01',
  totalPayroll: 0,
  budgetPct: 3.5,
  budgetTotal: 0,
  guidelineMin: 0,
  guidelineMax: 10,
  meritBudgetPercent: 3.5,
  bonusBudgetPercent: 10,
  guidelineMaxPercent: 10,
  minTenureDays: 0,
  allowEligibilityOverride: false,
  enableProration: false,
  prorationStartDate: '',
  eligibilityCutoffDate: '',
  status: 'open'
};

function lsGetCycle(): Cycle {
  try {
    const raw = localStorage.getItem(LS_CYCLE);
    return raw ? (JSON.parse(raw) as Cycle) : { ...DEFAULT_CYCLE };
  } catch {
    return { ...DEFAULT_CYCLE };
  }
}

function lsGetRecs(): RecommendationMap {
  try {
    const raw = localStorage.getItem(LS_RECS);
    return raw ? (JSON.parse(raw) as RecommendationMap) : {};
  } catch {
    return {};
  }
}

export function getDemoUserEmail(): string {
  return localStorage.getItem(LS_DEMO_USER_EMAIL) ?? 'admin@demo.com';
}

export function setDemoUserEmail(email: string) {
  localStorage.setItem(LS_DEMO_USER_EMAIL, email);
}

type ErrorBody = {
  error?: string;
  message?: string;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[]>;
  } | string;
  data?: {
    validationErrors?: Array<{ row: number; error: string }>;
    errors?: Array<{ row: number; message: string }>;
  };
};

function flattenValidationDetails(details: ErrorBody['details']): string | null {
  if (!details) return null;
  if (typeof details === 'string') return details;

  const formErrors = details.formErrors?.filter(Boolean) ?? [];
  const fieldErrors = Object.entries(details.fieldErrors ?? {})
    .flatMap(([field, messages]) =>
      (messages ?? []).filter(Boolean).map((message) => `${field}: ${message}`)
    );

  const merged = [...formErrors, ...fieldErrors];
  return merged.length ? merged.join(' | ') : null;
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = (await res.json()) as ErrorBody;
    const detailMessage = flattenValidationDetails(body.details);
    const rowErrors = ([...(body.data?.validationErrors ?? []).map((err) => ({ row: err.row, text: err.error })), ...((body.data?.errors ?? []).map((err) => ({ row: err.row, text: err.message })))] )
      .slice(0, 5)
      .map((err) => `Row ${err.row}: ${err.text}`)
      .join(' | ');
    const message = [body.message || body.error || fallback, detailMessage, rowErrors]
      .filter(Boolean)
      .join(' — ');
    return new Error(message || fallback);
  } catch {
    return new Error(fallback);
  }
}

function requireApi() {
  if (!API_BASE) {
    throw new Error(
      'VITE_API_URL is required for this operation in demo mode.'
    );
  }
}

function getAuthHeaders() {
  return {
    'x-demo-user-email': getDemoUserEmail()
  };
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = {
    ...(init?.headers ?? {}),
    ...getAuthHeaders()
  };

  return fetch(url, { ...init, headers });
}

async function readApiData<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw await parseError(res, fallback);
  const body = (await res.json()) as ApiResponse<T> | T;

  if (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    body.success === false
  ) {
    const apiError =
      ('error' in body && typeof body.error === 'string' && body.error) ||
      ('message' in body && typeof body.message === 'string' && body.message) ||
      fallback;
    throw new Error(apiError);
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    'data' in body &&
    body.data !== undefined
  ) {
    return body.data as T;
  }
  return body as T;
}

export async function fetchCurrentUser(): Promise<AppUser> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/users/me`);
  return readApiData<AppUser>(
    res,
    `Failed to load current user: ${res.status}`
  );
}

export async function fetchAppUsers(): Promise<AppUserRecord[]> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/users`);
  return readApiData<AppUserRecord[]>(
    res,
    `Failed to load app users: ${res.status}`
  );
}

export async function createAppUser(payload: {
  email: string;
  role: AppUser['role'];
  executiveName?: string;
  executiveEmail?: string;
  isActive?: boolean;
}): Promise<AppUserRecord> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return readApiData<AppUserRecord>(
    res,
    `Failed to create app user: ${res.status}`
  );
}

export async function updateAppUser(
  email: string,
  payload: {
    role?: AppUser['role'];
    executiveName?: string;
    executiveEmail?: string;
    isActive?: boolean;
  }
): Promise<AppUserRecord> {
  requireApi();
  const res = await authedFetch(
    `${API_BASE}/api/v1/users/${encodeURIComponent(email)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  return readApiData<AppUserRecord>(
    res,
    `Failed to update app user: ${res.status}`
  );
}

export async function fetchEmployees(): Promise<Employee[]> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees`);
  return readApiData<Employee[]>(
    res,
    `Failed to load employees: ${res.status}`
  );
}

export async function createEmployee(employee: Employee): Promise<Employee> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee)
  });

  return readApiData<Employee>(res, `Failed to create employee: ${res.status}`);
}

export async function updateEmployee(
  id: string,
  employee: Omit<Employee, 'id'>
): Promise<Employee> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee)
  });

  return readApiData<Employee>(res, `Failed to update employee: ${res.status}`);
}

export async function deleteEmployee(id: string): Promise<void> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees/${id}`, {
    method: 'DELETE'
  });

  await readApiData<{ id: string }>(
    res,
    `Failed to delete employee: ${res.status}`
  );
}

export async function previewEmployeesCsvImport(payload: {
  csvContent?: string;
  filePath?: string;
}): Promise<CsvImportPreview> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, action: 'preview' })
  });

  return readApiData<CsvImportPreview>(
    res,
    `Failed to preview employees CSV import: ${res.status}`
  );
}

export async function commitEmployeesCsvImport(payload: {
  csvContent?: string;
  filePath?: string;
}): Promise<CsvImportResult> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, action: 'commit' })
  });

  return readApiData<CsvImportResult>(
    res,
    `Failed to commit employees CSV import: ${res.status}`
  );
}

export async function fetchPayRanges(
  includeInactive = true
): Promise<PayRange[]> {
  requireApi();
  const res = await authedFetch(
    `${API_BASE}/api/v1/pay-ranges?includeInactive=${includeInactive ? 'true' : 'false'}`
  );
  return readApiData<PayRange[]>(
    res,
    `Failed to load pay ranges: ${res.status}`
  );
}

export async function createPayRange(payload: PayRange): Promise<PayRange> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/pay-ranges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return readApiData<PayRange>(
    res,
    `Failed to create pay range: ${res.status}`
  );
}

export async function updatePayRange(
  id: number,
  payload: PayRange
): Promise<PayRange> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/pay-ranges/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return readApiData<PayRange>(
    res,
    `Failed to update pay range: ${res.status}`
  );
}

export async function deactivatePayRange(id: number): Promise<void> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/pay-ranges/${id}`, {
    method: 'DELETE'
  });
  await readApiData(res, `Failed to deactivate pay range: ${res.status}`);
}

export async function importPayRangesCsv(payload: {
  csvContent: string;
}): Promise<PayRangeImportSummary> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/pay-ranges/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return readApiData<PayRangeImportSummary>(
    res,
    `Failed to import pay ranges CSV: ${res.status}`
  );
}

export async function fetchCycle(): Promise<Cycle> {
  if (API_BASE) {
    const res = await authedFetch(`${API_BASE}/api/v1/cycle`);
    if (!res.ok)
      throw await parseError(res, `Failed to load cycle: ${res.status}`);
    return res.json() as Promise<Cycle>;
  }
  return lsGetCycle();
}

export async function saveCycle(cycle: Cycle): Promise<Cycle> {
  const normalizeDate = (value?: string | null): string | null => {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;
    const match = ISO_DATE_ONLY.exec(trimmed);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (
      utcDate.getUTCFullYear() !== year ||
      utcDate.getUTCMonth() + 1 !== month ||
      utcDate.getUTCDate() !== day
    ) {
      return null;
    }
    return trimmed;
  };

  const payload = {
    ...cycle,
    openDate: normalizeDate(cycle.openDate),
    closeDate: normalizeDate(cycle.closeDate),
    effectiveDate: normalizeDate(cycle.effectiveDate),
    prorationStartDate: normalizeDate(cycle.prorationStartDate),
    eligibilityCutoffDate: normalizeDate(cycle.eligibilityCutoffDate)
  };

  if (API_BASE) {
    const res = await authedFetch(`${API_BASE}/api/v1/cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok)
      throw await parseError(res, `Failed to save cycle: ${res.status}`);
    return res.json() as Promise<Cycle>;
  }
  const localCycle: Cycle = {
    ...cycle,
    openDate: payload.openDate ?? '',
    closeDate: payload.closeDate ?? '',
    effectiveDate: payload.effectiveDate ?? '',
    prorationStartDate: payload.prorationStartDate ?? '',
    eligibilityCutoffDate: payload.eligibilityCutoffDate ?? ''
  };
  localStorage.setItem(LS_CYCLE, JSON.stringify(localCycle));
  return localCycle;
}

export async function fetchRecommendations(): Promise<RecommendationMap> {
  if (API_BASE) {
    const res = await authedFetch(`${API_BASE}/api/v1/recommendations`);
    if (!res.ok)
      throw await parseError(
        res,
        `Failed to load recommendations: ${res.status}`
      );
    return res.json() as Promise<RecommendationMap>;
  }
  return lsGetRecs();
}

export async function saveRecommendation(
  employeeId: string,
  data: Partial<Recommendation>
): Promise<void> {
  if (API_BASE) {
    const res = await authedFetch(
      `${API_BASE}/api/v1/recommendations/${employeeId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }
    );
    if (!res.ok)
      throw await parseError(
        res,
        `Failed to save recommendation: ${res.status}`
      );
    return;
  }
  const recs = lsGetRecs();
  const existing = recs[employeeId] ?? {
    meritPct: 0,
    performanceRating: 2,
    bonusTargetPercent: null,
    bonusPayoutPercent: 0,
    bonusPayoutAmount: 0,
    notes: '',
    status: 'Draft' as const
  };
  recs[employeeId] = {
    ...existing,
    ...data,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(LS_RECS, JSON.stringify(recs));
}

export async function submitAllRecommendations(
  employeeIds: string[]
): Promise<void> {
  if (API_BASE) {
    const res = await authedFetch(
      `${API_BASE}/api/v1/recommendations/submit-all`,
      { method: 'POST' }
    );
    if (!res.ok)
      throw await parseError(
        res,
        `Failed to submit recommendations: ${res.status}`
      );
    return;
  }
  const recs = lsGetRecs();
  for (const id of employeeIds) {
    const rec = recs[id];
    if (!rec || rec.status === 'Draft') {
      recs[id] = {
        ...(rec ?? {
          meritPct: 0,
          performanceRating: 2,
          bonusTargetPercent: null,
          bonusPayoutPercent: 0,
          bonusPayoutAmount: 0,
          notes: ''
        }),
        status: 'Submitted',
        updatedAt: new Date().toISOString()
      };
    }
  }
  localStorage.setItem(LS_RECS, JSON.stringify(recs));
}

export async function lockAllRecommendations(): Promise<{ locked: number }> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/recommendations/lock-all`, {
    method: 'POST'
  });
  return readApiData<{ locked: number }>(
    res,
    `Failed to lock recommendations: ${res.status}`
  );
}

export async function reopenAllRecommendations(): Promise<{
  reopened: number;
}> {
  requireApi();
  const res = await authedFetch(
    `${API_BASE}/api/v1/recommendations/reopen-all`,
    { method: 'POST' }
  );
  return readApiData<{ reopened: number }>(
    res,
    `Failed to reopen recommendations: ${res.status}`
  );
}

export async function downloadExport(
  path: 'employees.csv' | 'recommendations.csv'
): Promise<string> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/exports/${path}`);
  if (!res.ok)
    throw await parseError(res, `Failed to export ${path}: ${res.status}`);
  return res.text();
}


export async function fetchCompensationCycles(): Promise<CompensationCycle[]> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/compensation/cycles`);
  return readApiData<CompensationCycle[]>(
    res,
    `Failed to load compensation cycles: ${res.status}`
  );
}

export async function fetchCompensationTotalSummary(
  cycleId: number,
  filters?: { search?: string; department?: string; promotionOnly?: boolean }
): Promise<CompensationTotalSummaryRow[]> {
  requireApi();
  const url = new URL(`${API_BASE}/api/v1/compensation/cycles/${cycleId}/total-summary`, window.location.origin);
  if (filters?.search) url.searchParams.set('search', filters.search);
  if (filters?.department && filters.department !== 'all') url.searchParams.set('department', filters.department);
  if (filters?.promotionOnly) url.searchParams.set('promotionOnly', 'true');
  const res = await authedFetch(url.pathname + url.search);
  return readApiData<CompensationTotalSummaryRow[]>(
    res,
    `Failed to load compensation total summary: ${res.status}`
  );
}


export async function downloadCompensationFilteredExport(
  cycleId: number,
  filters?: { search?: string; department?: string; promotionOnly?: boolean }
): Promise<{ csv: string; metadata: Record<string, string | null> }> {
  requireApi();
  const url = new URL(`${API_BASE}/api/v1/compensation/cycles/${cycleId}/total-summary.csv`, window.location.origin);
  if (filters?.search) url.searchParams.set('search', filters.search);
  if (filters?.department && filters.department !== 'all') url.searchParams.set('department', filters.department);
  if (filters?.promotionOnly) url.searchParams.set('promotionOnly', 'true');
  const res = await authedFetch(url.pathname + url.search);
  if (!res.ok) throw await parseError(res, `Failed to export compensation summary: ${res.status}`);
  return {
    csv: await res.text(),
    metadata: {
      schemaVersion: res.headers.get('x-export-schema-version'),
      cycleId: res.headers.get('x-export-cycle-id'),
      generatedAt: res.headers.get('x-export-generated-at'),
      filterSummary: res.headers.get('x-export-filter-summary')
    }
  };
}

export async function saveEmployeeCyclePlan(
  cycleId: number,
  employeeId: string,
  payload: Partial<EmployeeCyclePlanPayload>
): Promise<void> {
  requireApi();
  const res = await authedFetch(
    `${API_BASE}/api/v1/compensation/cycles/${cycleId}/plans/${encodeURIComponent(employeeId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  await readApiData(res, `Failed to save cycle plan: ${res.status}`);
}


export async function fetchPlannerAudit(
  cycleId: number,
  employeeId: string,
  limit = 25
): Promise<PlannerAuditChange[]> {
  requireApi();
  const url = new URL(`${API_BASE}/api/v1/compensation/cycles/${cycleId}/plans/${encodeURIComponent(employeeId)}/audit`, window.location.origin);
  url.searchParams.set('limit', String(limit));
  const res = await authedFetch(url.pathname + url.search);
  return readApiData<PlannerAuditChange[]>(res, `Failed to load planner audit: ${res.status}`);
}

export async function bulkUpdateEmployeeCyclePlans(
  cycleId: number,
  payload: {
    employeeIds?: string[];
    filters?: Record<string, string | boolean>;
    updates: Partial<EmployeeCyclePlanPayload>;
  }
): Promise<{ updated: number; employeeIds: string[] }> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/compensation/cycles/${cycleId}/plans/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return readApiData<{ updated: number; employeeIds: string[] }>(res, `Failed to bulk update cycle plans: ${res.status}`);
}

export async function updateEmployeePlanStatus(
  cycleId: number,
  employeeId: string,
  status: PlannerWorkflowStatus
): Promise<void> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/compensation/cycles/${cycleId}/plans/${encodeURIComponent(employeeId)}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  await readApiData(res, `Failed to update planner status: ${res.status}`);
}
