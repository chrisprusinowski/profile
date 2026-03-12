import { parse } from 'csv-parse/sync';

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

export const OPTIONAL_COLUMNS = ['position_type', 'geography', 'level'] as const;

export type CanonicalEmployeeImportColumn =
  | (typeof REQUIRED_COLUMNS)[number]
  | (typeof OPTIONAL_COLUMNS)[number]
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

const KNOWN_COLUMNS = new Set<CanonicalEmployeeImportColumn>([
  ...REQUIRED_COLUMNS,
  ...OPTIONAL_COLUMNS,
  'manager_email'
]);

const RECOMMENDED_FIELDS = ['email', 'department', 'title'] as const;

export type RowValidationError = { row: number; message: string };
export type RowValidationWarning = { row: number; message: string };

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

export type ImportPreview = {
  rowsReceived: number;
  rowsValid: number;
  rowsInvalid: number;
  errors: RowValidationError[];
  warnings: RowValidationWarning[];
};

export type ImportPreparation = {
  validRows: NormalizedEmployeeImportRow[];
  preview: ImportPreview;
  unknownColumns: string[];
};

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-_]+/g, '').replace(/[^a-z0-9]/g, '');
}

export function toCanonicalHeader(header: string): string {
  const alias = HEADER_ALIASES[normalizeHeaderKey(header)];
  return alias ?? header.trim().toLowerCase().replace(/[\s\-]+/g, '_');
}

export function parseCsv(text: string): Record<string, string>[] {
  if (!text.trim()) return [];
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: false
  }) as Array<Record<string, unknown>>;

  return records.map((record) => Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, String(value ?? '')])
  ));
}

export function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s{2,}/g, ' ');
}

export function normalizeEmail(value: string | undefined): string {
  return normalizeText(value).toLowerCase();
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseSalary(value: string | undefined): number | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[,$€£¥\s]/g, '');
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function parseDate(value: string | undefined): string | null {
  const raw = normalizeText(value);
  if (!raw) return '';

  const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  let year = 0;
  let month = 0;
  let day = 0;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!iso && us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3]);
  }

  const natural = /^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(raw);
  if (!iso && !us && natural) {
    const parsedMonth = MONTHS[natural[1].toLowerCase()];
    if (parsedMonth) {
      month = parsedMonth;
      day = Number(natural[2]);
      year = Number(natural[3]);
    }
  }

  if (!year || !month || !day) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function prepareEmployeeImport(csvContent: string): ImportPreparation {
  const errors: RowValidationError[] = [];
  const warnings: RowValidationWarning[] = [];

  let rawRows: Record<string, string>[] = [];
  try {
    rawRows = parseCsv(csvContent);
  } catch {
    return {
      validRows: [],
      preview: {
        rowsReceived: 0,
        rowsValid: 0,
        rowsInvalid: 0,
        errors: [{ row: 1, message: 'CSV is empty or malformed' }],
        warnings: []
      },
      unknownColumns: []
    };
  }

  if (rawRows.length === 0) {
    return {
      validRows: [],
      preview: {
        rowsReceived: 0,
        rowsValid: 0,
        rowsInvalid: 0,
        errors: [{ row: 1, message: 'CSV must include at least one data row' }],
        warnings: []
      },
      unknownColumns: []
    };
  }

  const originalHeaders = Object.keys(rawRows[0] ?? {});
  const canonicalHeaderMap = new Map<string, string>();
  for (const header of originalHeaders) {
    canonicalHeaderMap.set(toCanonicalHeader(header), header);
  }

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !canonicalHeaderMap.has(column));
  if (missingColumns.length > 0) {
    return {
      validRows: [],
      preview: {
        rowsReceived: rawRows.length,
        rowsValid: 0,
        rowsInvalid: rawRows.length,
        errors: [{ row: 1, message: `Missing required columns: ${missingColumns.join(', ')}` }],
        warnings: []
      },
      unknownColumns: Array.from(canonicalHeaderMap.keys()).filter((header) => !KNOWN_COLUMNS.has(header as CanonicalEmployeeImportColumn))
    };
  }

  const unknownColumns = Array.from(canonicalHeaderMap.keys()).filter((header) => !KNOWN_COLUMNS.has(header as CanonicalEmployeeImportColumn));

  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const validRows: NormalizedEmployeeImportRow[] = [];

  rawRows.forEach((sourceRow, index) => {
    const rowNumber = index + 2;
    const read = (canonical: string): string => {
      const original = canonicalHeaderMap.get(canonical);
      return original ? sourceRow[original] ?? '' : '';
    };

    const id = normalizeText(read('id'));
    const name = normalizeText(read('name'));
    const email = normalizeEmail(read('email'));
    const department = normalizeText(read('department'));
    const title = normalizeText(read('title'));
    const rawManager = normalizeText(read('manager'));
    const rawManagerEmail = normalizeEmail(read('manager_email'));
    const managerLooksLikeEmail = !rawManagerEmail && looksLikeEmail(rawManager);
    const manager = managerLooksLikeEmail ? '' : rawManager;
    const managerEmail = managerLooksLikeEmail ? normalizeEmail(rawManager) : rawManagerEmail;
    const positionType = normalizeText(read('position_type'));
    const geography = normalizeText(read('geography'));
    const level = normalizeText(read('level'));
    const salary = parseSalary(read('salary'));
    const hireDate = parseDate(read('hire_date'));

    const rowErrors: string[] = [];

    if (!name) rowErrors.push('Missing name');
    if (salary === null) rowErrors.push('Salary could not be parsed');

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowErrors.push(`Invalid email: "${read('email')}"`);
    }

    if (hireDate === null) rowErrors.push(`Invalid hire_date: "${read('hire_date')}"`);

    if (id && seenIds.has(id.toLowerCase())) {
      rowErrors.push(`Duplicate id in file: "${id}"`);
    }
    if (id) seenIds.add(id.toLowerCase());

    if (email && seenEmails.has(email)) {
      rowErrors.push(`Duplicate email in file: "${email}"`);
    }
    if (email) seenEmails.add(email);

    if (!id) {
      warnings.push({ row: rowNumber, message: 'Missing id, UUID will be generated on commit' });
    }

    for (const field of RECOMMENDED_FIELDS) {
      const value = field === 'email' ? email : field === 'department' ? department : title;
      if (!value) warnings.push({ row: rowNumber, message: `Recommended field missing: ${field}` });
    }

    if (managerLooksLikeEmail) {
      warnings.push({
        row: rowNumber,
        message: 'manager looked like an email; normalized to manager_email for manager-scope visibility'
      });
    }

    if (rowErrors.length > 0) {
      rowErrors.forEach((message) => errors.push({ row: rowNumber, message }));
      return;
    }

    const normalizedSalary = salary as number;

    validRows.push({
      rowNumber,
      id,
      name,
      email,
      department,
      title,
      salary: normalizedSalary,
      manager,
      managerEmail,
      hireDate: hireDate ?? '',
      positionType,
      geography,
      level
    });
  });

  return {
    validRows,
    preview: {
      rowsReceived: rawRows.length,
      rowsValid: validRows.length,
      rowsInvalid: rawRows.length - validRows.length,
      errors,
      warnings
    },
    unknownColumns
  };
}
