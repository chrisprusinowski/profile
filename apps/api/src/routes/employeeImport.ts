export const REQUIRED_COLUMNS = [
  'id',
  'name',
  'email',
  'department',
  'title',
  'salary',
  'manager',
  'hire_date'
] as const;

export type CanonicalEmployeeImportColumn =
  | (typeof REQUIRED_COLUMNS)[number]
  | 'position_type'
  | 'geography'
  | 'level'
  | 'manager_email';

const HEADER_ALIASES: Record<string, CanonicalEmployeeImportColumn> = {
  id: 'id', employeeid: 'id', empid: 'id', eid: 'id', employeenumber: 'id',
  name: 'name', fullname: 'name', employeename: 'name', displayname: 'name',
  email: 'email', emailaddress: 'email', mail: 'email', workemail: 'email',
  department: 'department', dept: 'department', division: 'department', team: 'department', businessunit: 'department',
  title: 'title', jobtitle: 'title', role: 'title', jobname: 'title',
  salary: 'salary', basesalary: 'salary', annualsalary: 'salary', basepay: 'salary',
  compensation: 'salary', pay: 'salary', wage: 'salary', currentsalary: 'salary',
  manager: 'manager', managername: 'manager', supervisor: 'manager', reportsto: 'manager', mgr: 'manager',
  hiredate: 'hire_date', hire_date: 'hire_date', startdate: 'hire_date', dateofhire: 'hire_date', joindate: 'hire_date',
  positiontype: 'position_type', position_type: 'position_type', emptype: 'position_type', employeetype: 'position_type',
  geography: 'geography', geo: 'geography', location: 'geography', region: 'geography', country: 'geography',
  level: 'level', grade: 'level', band: 'level', joblevel: 'level',
  manageremail: 'manager_email', manager_email: 'manager_email', managermail: 'manager_email'
};

export type CsvParseResult = {
  headers: string[];
  rows: string[][];
};

export type RowValidationError = { row: number; error: string };

export type NormalizedEmployeeImportRow = {
  rowNumber: number;
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  salary: number;
  manager: string;
  managerEmail: string;
  hireDate: string;
  positionType: string;
  geography: string;
  level: string;
};

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-_]+/g, '').replace(/[^a-z0-9]/g, '');
}

export function toCanonicalHeader(header: string): string {
  const alias = HEADER_ALIASES[normalizeHeaderKey(header)];
  return alias ?? header.trim().toLowerCase().replace(/[\s\-]+/g, '_');
}

export function parseCsv(text: string): CsvParseResult {
  if (!text.trim()) return { headers: [], rows: [] };
  const cleanedText = text.replace(/^\uFEFF/, '');

  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanedText.length; i += 1) {
    const char = cleanedText[i];
    const next = cleanedText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((value) => value.length > 0)) {
        allRows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((value) => value.length > 0)) {
      allRows.push(currentRow);
    }
  }

  if (allRows.length === 0) return { headers: [], rows: [] };
  const headers = allRows[0];
  const rows = allRows.slice(1);
  return { headers, rows };
}

export function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s{2,}/g, ' ');
}

export function normalizeEmail(value: string | undefined): string {
  return normalizeText(value).toLowerCase();
}

export function parseSalary(value: string | undefined): number | null {
  const raw = normalizeText(value);
  if (!raw) return 0;
  const cleaned = raw.replace(/[,$€£¥\s]/g, '');
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function parseDate(value: string | undefined): string | null {
  const raw = normalizeText(value);
  if (!raw) return '';

  let year = 0;
  let month = 0;
  let day = 0;

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  }

  const us = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (!iso && us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3]);
  }

  if (!iso && !us) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      year = parsed.getUTCFullYear();
      month = parsed.getUTCMonth() + 1;
      day = parsed.getUTCDate();
    }
  }

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function validateAndNormalizeRows(csvContent: string): {
  rows: NormalizedEmployeeImportRow[];
  errors: RowValidationError[];
  rowsProcessed: number;
  unknownColumns: string[];
} {
  const parsed = parseCsv(csvContent);
  if (parsed.headers.length === 0) {
    return { rows: [], errors: [{ row: 1, error: 'CSV is empty or malformed' }], rowsProcessed: 0, unknownColumns: [] };
  }

  const headers = parsed.headers.map(toCanonicalHeader);
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    return {
      rows: [],
      errors: [{ row: 1, error: `Missing required columns: ${missingColumns.join(', ')}` }],
      rowsProcessed: parsed.rows.length,
      unknownColumns: headers.filter((header) => !REQUIRED_COLUMNS.includes(header as (typeof REQUIRED_COLUMNS)[number]) && !['position_type', 'geography', 'level', 'manager_email'].includes(header))
    };
  }

  const unknownColumns = headers.filter(
    (header) => !REQUIRED_COLUMNS.includes(header as (typeof REQUIRED_COLUMNS)[number]) && !['position_type', 'geography', 'level', 'manager_email'].includes(header)
  );

  const errors: RowValidationError[] = [];
  const rows: NormalizedEmployeeImportRow[] = [];
  const seenIds = new Set<string>();

  parsed.rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = rawRow[i] ?? '';
    });

    const id = normalizeText(row.id);
    const name = normalizeText(row.name);
    const email = normalizeEmail(row.email);
    const department = normalizeText(row.department);
    const title = normalizeText(row.title);
    const manager = normalizeText(row.manager);
    const managerEmail = normalizeEmail(row.manager_email);
    const positionType = normalizeText(row.position_type);
    const geography = normalizeText(row.geography);
    const level = normalizeText(row.level);
    const salary = parseSalary(row.salary);
    const hireDate = parseDate(row.hire_date);

    if (!id) errors.push({ row: rowNumber, error: 'id is required' });
    if (!name) errors.push({ row: rowNumber, error: 'name is required' });
    if (salary === null) errors.push({ row: rowNumber, error: `salary is invalid: "${row.salary ?? ''}"` });
    if (hireDate === null) errors.push({ row: rowNumber, error: `hire_date could not be parsed: "${row.hire_date ?? ''}"` });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: rowNumber, error: `email is invalid: "${row.email ?? ''}"` });
    }
    if (managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) {
      errors.push({ row: rowNumber, error: `manager_email is invalid: "${row.manager_email ?? ''}"` });
    }

    if (id && seenIds.has(id.toLowerCase())) {
      errors.push({ row: rowNumber, error: `duplicate id in import file: "${id}"` });
    }
    if (id) seenIds.add(id.toLowerCase());

    if (errors.some((err) => err.row === rowNumber)) return;

    rows.push({
      rowNumber,
      id,
      name,
      email,
      department,
      title,
      salary: salary ?? 0,
      manager,
      managerEmail,
      hireDate: hireDate ?? '',
      positionType,
      geography,
      level
    });
  });

  return { rows, errors, rowsProcessed: parsed.rows.length, unknownColumns };
}
