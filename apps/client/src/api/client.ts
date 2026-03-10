import type { AppUser, Cycle, Employee, Recommendation, RecommendationMap } from '../types.js';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';
const LS_DEMO_USER_EMAIL = 'mc_demo_user_email';

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
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

export interface AppUserRecord extends AppUser {
  createdAt: string;
  updatedAt: string;
}

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

export function getDemoUserEmail(): string {
  return localStorage.getItem(LS_DEMO_USER_EMAIL) ?? 'admin@demo.com';
}

export function setDemoUserEmail(email: string) {
  localStorage.setItem(LS_DEMO_USER_EMAIL, email);
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

function getAuthHeaders() {
  return {
    'x-demo-user-email': getDemoUserEmail(),
  };
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = {
    ...(init?.headers ?? {}),
    ...getAuthHeaders(),
  };

  return fetch(url, { ...init, headers });
}

async function readApiData<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw await parseError(res, fallback);
  const body = (await res.json()) as ApiResponse<T> | T;
  if (typeof body === 'object' && body !== null && 'data' in body && body.data !== undefined) {
    return body.data as T;
  }
  return body as T;
}

export async function fetchCurrentUser(): Promise<AppUser> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/users/me`);
  return readApiData<AppUser>(res, `Failed to load current user: ${res.status}`);
}

export async function fetchAppUsers(): Promise<AppUserRecord[]> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/users`);
  return readApiData<AppUserRecord[]>(res, `Failed to load app users: ${res.status}`);
}

export async function createAppUser(payload: { email: string; role: AppUser['role']; managerName?: string; isActive?: boolean }): Promise<AppUserRecord> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readApiData<AppUserRecord>(res, `Failed to create app user: ${res.status}`);
}

export async function updateAppUser(email: string, payload: { role?: AppUser['role']; managerName?: string; isActive?: boolean }): Promise<AppUserRecord> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/users/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readApiData<AppUserRecord>(res, `Failed to update app user: ${res.status}`);
}

export async function fetchEmployees(): Promise<Employee[]> {
  if (!API_BASE) return [];
  const res = await authedFetch(`${API_BASE}/api/v1/employees`);
  return readApiData<Employee[]>(res, `Failed to load employees: ${res.status}`);
}

export async function createEmployee(employee: Employee): Promise<Employee> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee),
  });

  return readApiData<Employee>(res, `Failed to create employee: ${res.status}`);
}

export async function updateEmployee(id: string, employee: Omit<Employee, 'id'>): Promise<Employee> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee),
  });

  return readApiData<Employee>(res, `Failed to update employee: ${res.status}`);
}

export async function deleteEmployee(id: string): Promise<void> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees/${id}`, {
    method: 'DELETE',
  });

  await readApiData<{ id: string }>(res, `Failed to delete employee: ${res.status}`);
}

export async function importEmployeesCsv(payload: { csvContent?: string; filePath?: string }): Promise<CsvImportSummary> {
  requireApi();
  const res = await authedFetch(`${API_BASE}/api/v1/employees/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return readApiData<CsvImportSummary>(res, `Failed to import employees CSV: ${res.status}`);
}

export async function fetchCycle(): Promise<Cycle> {
  if (API_BASE) {
    const res = await authedFetch(`${API_BASE}/api/v1/cycle`);
    if (!res.ok) throw await parseError(res, `Failed to load cycle: ${res.status}`);
    return res.json() as Promise<Cycle>;
  }
  return lsGetCycle();
}

export async function saveCycle(cycle: Cycle): Promise<Cycle> {
  if (API_BASE) {
    const res = await authedFetch(`${API_BASE}/api/v1/cycle`, {
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
    const res = await authedFetch(`${API_BASE}/api/v1/recommendations`);
    if (!res.ok) throw await parseError(res, `Failed to load recommendations: ${res.status}`);
    return res.json() as Promise<RecommendationMap>;
  }
  return lsGetRecs();
}

export async function saveRecommendation(employeeId: string, data: Partial<Recommendation>): Promise<void> {
  if (API_BASE) {
    const res = await authedFetch(`${API_BASE}/api/v1/recommendations/${employeeId}`, {
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

export async function submitAllRecommendations(employeeIds: string[]): Promise<void> {
  if (API_BASE) {
    const res = await authedFetch(`${API_BASE}/api/v1/recommendations/submit-all`, { method: 'POST' });
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
