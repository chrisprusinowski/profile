/**
 * API client — dual-mode:
 *   • VITE_API_URL set → calls the live Express API (local dev / self-hosted)
 *   • Not set → reads employees from __STATIC_CSV__ (bundled at Vite build time)
 *               and stores recommendations + cycle in localStorage (GitHub Pages)
 */
import type { Cycle, Employee, Recommendation, RecommendationMap } from '../types.js';

declare const __STATIC_CSV__: string;

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

// ── CSV parser (used in static mode) ──────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(raw: string): Employee[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
  );
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line, idx) => {
      const vals = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = vals[i] ?? '';
      });
      const salary = parseFloat(row['salary'] ?? '0');
      return {
        id: row['id']?.trim() || `emp-${idx + 1}`,
        name: row['name'] ?? '',
        email: row['email'] || undefined,
        department: row['department'] || undefined,
        title: row['title'] || undefined,
        salary: isNaN(salary) ? 0 : salary,
        manager: row['manager'] || undefined,
        hireDate: row['hire_date'] || undefined,
      };
    })
    .filter((e) => e.name);
}

// ── localStorage helpers (static mode) ────────────────────────────────────────

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

// ── Public API ─────────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<Employee[]> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/employees`);
    if (!res.ok) throw new Error(`Failed to load employees: ${res.status}`);
    return res.json() as Promise<Employee[]>;
  }
  return parseCsv(__STATIC_CSV__);
}

export async function fetchCycle(): Promise<Cycle> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/cycle`);
    if (!res.ok) throw new Error(`Failed to load cycle: ${res.status}`);
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
    if (!res.ok) throw new Error(`Failed to save cycle: ${res.status}`);
    return res.json() as Promise<Cycle>;
  }
  localStorage.setItem(LS_CYCLE, JSON.stringify(cycle));
  return cycle;
}

export async function fetchRecommendations(): Promise<RecommendationMap> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/v1/recommendations`);
    if (!res.ok) throw new Error(`Failed to load recommendations: ${res.status}`);
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
    if (!res.ok) throw new Error(`Failed to save recommendation: ${res.status}`);
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
    await fetch(`${API_BASE}/api/v1/recommendations/submit-all`, { method: 'POST' });
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
