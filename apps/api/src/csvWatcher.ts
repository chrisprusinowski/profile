/**
 * csvWatcher.ts
 *
 * Reads data/employees.csv from the repo root, parses it, and caches the result
 * in memory. Uses Node's built-in fs.watch to reload automatically whenever the
 * file changes.
 */

import { readFileSync, watch, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CSV_PATH = resolve(__dirname, '../../../data/employees.csv');

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  salary: number;
  manager: string;
  hireDate: string;
}

const REQUIRED_HEADERS = ['name', 'salary'];

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

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function parseCsv(raw: string): { employees: Employee[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    warnings.push('CSV is empty.');
    return { employees: [], warnings };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  if (headers.length === 0) {
    warnings.push('CSV header row is missing.');
    return { employees: [], warnings };
  }

  const missingRequired = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingRequired.length > 0) {
    warnings.push(`CSV missing required column(s): ${missingRequired.join(', ')}`);
    return { employees: [], warnings };
  }

  const employees = lines
    .slice(1)
    .map((line, idx) => {
      const vals = parseCsvLine(line);
      if (vals.length !== headers.length) {
        warnings.push(
          `Row ${idx + 2} has ${vals.length} column(s), expected ${headers.length}. It was still parsed best-effort.`,
        );
      }

      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = vals[i] ?? '';
      });

      const salary = Number.parseFloat(row['salary'] ?? '0');
      const id = row['id']?.trim() || `emp-${idx + 1}`;
      const name = row['name']?.trim() ?? '';
      if (!name) {
        warnings.push(`Row ${idx + 2} skipped because name is empty.`);
        return null;
      }

      if (Number.isNaN(salary)) {
        warnings.push(`Row ${idx + 2} has invalid salary "${row['salary'] ?? ''}". Using 0.`);
      }

      return {
        id,
        name,
        email: row['email'] ?? '',
        department: row['department'] ?? '',
        title: row['title'] ?? '',
        salary: Number.isNaN(salary) ? 0 : salary,
        manager: row['manager'] ?? '',
        hireDate: row['hire_date'] ?? '',
      } as Employee;
    })
    .filter((e): e is Employee => e !== null);

  return { employees, warnings };
}

let _cache: Employee[] = [];

function reload(reason = 'initial load') {
  if (!existsSync(CSV_PATH)) {
    console.warn(`[csvWatcher] ${CSV_PATH} not found (${reason}) — employee list will be empty`);
    _cache = [];
    return;
  }

  try {
    const raw = readFileSync(CSV_PATH, 'utf-8');
    const { employees, warnings } = parseCsv(raw);
    _cache = employees;

    console.log(`[csvWatcher] Loaded ${_cache.length} employees from ${CSV_PATH} (${reason})`);
    for (const warning of warnings) {
      console.warn(`[csvWatcher] ${warning}`);
    }
  } catch (err) {
    _cache = [];
    console.error('[csvWatcher] Failed to load CSV. Employee list reset to empty.', err);
  }
}

reload();

function attachWatch() {
  watch(CSV_PATH, () => {
    setTimeout(() => reload('file update'), 150);
  });
  console.log(`[csvWatcher] Watching ${CSV_PATH} for updates`);
}

if (existsSync(CSV_PATH)) {
  attachWatch();
} else {
  const interval = setInterval(() => {
    if (existsSync(CSV_PATH)) {
      reload('file appeared');
      clearInterval(interval);
      attachWatch();
    }
  }, 5000);
  interval.unref();
}

export function getEmployees(): Employee[] {
  return _cache;
}

export function getEmployee(id: string): Employee | undefined {
  return _cache.find((e) => e.id === id);
}
