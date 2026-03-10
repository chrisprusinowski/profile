import type { Cycle, Employee, Recommendation, RecommendationMap } from '../types.js';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
};

export type CsvImportSummary = {
  rowsProcessed: number;
  inserted: number;
  updated: number;
  rejected: number;
  validationErrors: Array<{ row: number; error: string }>;
};

const LS_CYCLE = 'mc_cycle_v2';
const LS_RECS = 'mc_recommendations_v2';

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
  status: 'open',
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

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return new Error(body.message || body.error || fallback);
  } catch {
    return new Error(fallback);
  }
}

function requireApi() {
  if (!API_BASE) {
    throw new Error('VITE_API_URL is required for this operation in demo mode.');
  }
}

async function readApiData<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw await parseError(res, fallback);
  const body = (await res.json()) as ApiResponse<T> | T;
  if (typeof body === 'object' && body !== null && 'success' in body && 'data' in body) {
    return body.data;
  }
  return body as T;
}

export async function fetchEmployees(): Promise<Employee[]> {
  if (!API_BASE) return [];
  const res = await fetch(`${API_BASE}/api/v1/employees`);
  return readApiData<Employee[]>(res, `Failed to load employees: ${res.status}`);
}

export async function createEmployee(employee: Employee): Promise<Employee> {
  requireApi();
  const res = await fetch(`${API_BASE}/api/v1/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee),
  });

  return readApiData<Employee>(res, `Failed to create employee: ${res.status}`);
}

export async function updateEmployee(id: string, employee: Omit<Employee, 'id'>): Promise<Employee> {
  requireApi();
  const res = await fetch(`${API_BASE}/api/v1/employees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee),
  });

  return readApiData<Employee>(res, `Failed to update employee: ${res.status}`);
}

export async function deleteEmployee(id: string): Promise<void> {
  requireApi();
  const res = await fetch(`${API_BASE}/api/v1/employees/${id}`, {
    method: 'DELETE',
  });

  await readApiData<{ id: string }>(res, `Failed to delete employee: ${res.status}`);
}

export async function importEmployeesCsv(payload: { csvContent?: string; filePath?: string }): Promise<CsvImportSummary> {
  requireApi();
  const res = await fetch(`${API_BASE}/api/v1/employees/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return readApiData<CsvImportSummary>(res, `Failed to import employees CSV: ${res.status}`);
}

export async function fetchCycle(): Promise<Cycle> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/cycle`);
    if (!res.ok) throw await parseError(res, `Failed to load cycle: ${res.status}`);
    return res.json() as Promise<Cycle>;
  }
  return lsGetCycle();
}

export async function saveCycle(cycle: Cycle): Promise<Cycle> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cycle),
    });
    if (!res.ok) throw await parseError(res, `Failed to save cycle: ${res.status}`);
    return res.json() as Promise<Cycle>;
  }
  localStorage.setItem(LS_CYCLE, JSON.stringify(cycle));
  return cycle;
}

export async function fetchRecommendations(): Promise<RecommendationMap> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/recommendations`);
    if (!res.ok) throw await parseError(res, `Failed to load recommendations: ${res.status}`);
    return res.json() as Promise<RecommendationMap>;
  }
  return lsGetRecs();
}

export async function saveRecommendation(
  employeeId: string,
  data: Partial<Recommendation>,
): Promise<void> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/recommendations/${employeeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await parseError(res, `Failed to save recommendation: ${res.status}`);
    return;
  }
  const recs = lsGetRecs();
  const existing = recs[employeeId] ?? {
    meritPct: 0,
    rating: 'Meets Expectations',
    notes: '',
    status: 'Draft' as const,
  };
  recs[employeeId] = { ...existing, ...data, updatedAt: new Date().toISOString() };
  localStorage.setItem(LS_RECS, JSON.stringify(recs));
}

export async function submitAllRecommendations(
  employeeIds: string[],
): Promise<void> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/recommendations/submit-all`, { method: 'POST' });
    if (!res.ok) throw await parseError(res, `Failed to submit recommendations: ${res.status}`);
    return;
  }
  const recs = lsGetRecs();
  for (const id of employeeIds) {
    const rec = recs[id];
    if (!rec || rec.status === 'Draft') {
      recs[id] = {
        ...(rec ?? { meritPct: 0, rating: 'Meets Expectations', notes: '' }),
        status: 'Submitted',
        updatedAt: new Date().toISOString(),
      };
    }
  }
  localStorage.setItem(LS_RECS, JSON.stringify(recs));
}
