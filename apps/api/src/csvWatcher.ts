/**
 * csvWatcher.ts
 *
 * Reads data/employees.csv from the repo root, parses it, and caches the result
 * in memory. Uses Node's built-in fs.watch to reload automatically whenever the
 * file changes — drop a new export in the folder and the API serves it immediately.
 */

import { readFileSync, watch, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CSV_PATH = resolve(__dirname, '../../../../data/employees.csv');

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

// ── CSV parser ─────────────────────────────────────────────────────────────────

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

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

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
      const id = row['id']?.trim() || `emp-${idx + 1}`;

      return {
        id,
        name: row['name'] ?? '',
        email: row['email'] ?? '',
        department: row['department'] ?? '',
        title: row['title'] ?? '',
        salary: isNaN(salary) ? 0 : salary,
        manager: row['manager'] ?? '',
        hireDate: row['hire_date'] ?? '',
      };
    })
    .filter((e) => e.name);
}

// ── In-memory cache ────────────────────────────────────────────────────────────

let _cache: Employee[] = [];

function reload() {
  if (!existsSync(CSV_PATH)) {
    console.warn(`[csvWatcher] ${CSV_PATH} not found — employee list will be empty`);
    _cache = [];
    return;
  }
  try {
    const raw = readFileSync(CSV_PATH, 'utf-8');
    _cache = parseCsv(raw);
    console.log(`[csvWatcher] Loaded ${_cache.length} employees from data/employees.csv`);
  } catch (err) {
    console.error('[csvWatcher] Failed to parse CSV:', err);
  }
}

// Initial load
reload();

// Watch for changes
if (existsSync(CSV_PATH)) {
  watch(CSV_PATH, () => {
    // Small debounce: some editors write in two steps
    setTimeout(reload, 150);
  });
} else {
  // Poll every 5 s waiting for the file to appear
  const interval = setInterval(() => {
    if (existsSync(CSV_PATH)) {
      reload();
      clearInterval(interval);
      watch(CSV_PATH, () => setTimeout(reload, 150));
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
