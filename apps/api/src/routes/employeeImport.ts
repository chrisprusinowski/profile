import { parse } from 'csv-parse/sync';

export const CANONICAL_COLUMNS = [
  'employee_id',
  'first_name',
  'last_name',
  'full_name',
  'manager_name',
  'manager_id',
  'manager_email',
  'executive_name',
  'executive_email',
  'job_title',
  'job_family_group',
  'job_family',
  'level',
  'start_date',
  'hire_date',
  'location',
  'geo',
  'business_entity',
  'employment_classification',
  'flsa_status',
  'hourly_rate',
  'current_salary',
  'range_low',
  'range_mid',
  'range_high',
  'compa_ratio',
  'bonus_target_percent',
  'department',
  'total_cash',
  'total_comp'
] as const;

export type CanonicalEmployeeImportColumn = (typeof CANONICAL_COLUMNS)[number];

const HEADER_ALIASES: Record<string, CanonicalEmployeeImportColumn> = {
  id: 'employee_id', employeeid: 'employee_id', empid: 'employee_id', eid: 'employee_id', employeenumber: 'employee_id',
  firstname: 'first_name', lastname: 'last_name',
  name: 'full_name', fullname: 'full_name', employeename: 'full_name', displayname: 'full_name',
  manager: 'manager_name', managername: 'manager_name', supervisor: 'manager_name', reportsto: 'manager_name', mgr: 'manager_name',
  managerid: 'manager_id',
  manageremail: 'manager_email', manager_email: 'manager_email', managermail: 'manager_email',
  execname: 'executive_name', executivename: 'executive_name',
  execemail: 'executive_email', executiveemail: 'executive_email',
  title: 'job_title', jobtitle: 'job_title', role: 'job_title', jobname: 'job_title',
  jobfamilygroup: 'job_family_group', jobfamily: 'job_family',
  level: 'level', grade: 'level', band: 'level', joblevel: 'level',
  startdate: 'start_date',
  hiredate: 'hire_date', dateofhire: 'hire_date', joindate: 'hire_date',
  location: 'location', geography: 'geo', geo: 'geo', region: 'geo', country: 'geo',
  businessentity: 'business_entity', legalentity: 'business_entity',
  employmentclassification: 'employment_classification', employeeclassification: 'employment_classification',
  flsastatus: 'flsa_status',
  hourlyrate: 'hourly_rate',
  salary: 'current_salary', basesalary: 'current_salary', annualsalary: 'current_salary', basepay: 'current_salary',
  compensation: 'current_salary', pay: 'current_salary', wage: 'current_salary', currentsalary: 'current_salary',
  low: 'range_low', rangelow: 'range_low', minimum: 'range_low',
  mid: 'range_mid', midpoint: 'range_mid', rangemid: 'range_mid', p50basesalary: 'range_mid',
  high: 'range_high', rangehigh: 'range_high', maximum: 'range_high',
  comparatio: 'compa_ratio',
  bonustarget: 'bonus_target_percent', bonustargetpercent: 'bonus_target_percent',
  department: 'department', dept: 'department', division: 'department', team: 'department', businessunit: 'department',
  totalcash: 'total_cash',
  totalcomp: 'total_comp'
};

export type RowValidationWarning = { row: number; message: string };

export type ImportColumnMapping = {
  sourceColumn: string;
  canonicalColumn: CanonicalEmployeeImportColumn | null;
  isRecognized: boolean;
  confidence: number;
};

export type NormalizedEmployeeImportRow = {
  rowNumber: number;
  employeeId: string;
  normalized: Partial<Record<CanonicalEmployeeImportColumn, string | number | null>>;
  unmappedAttributes: Record<string, string>;
  warnings: string[];
};

export type ImportPreview = {
  rowsReceived: number;
  rowsNormalized: number;
  rowsWithWarnings: number;
  errors: Array<{ row: number; message: string }>;
  warnings: RowValidationWarning[];
};

export type ImportPreparation = {
  rows: NormalizedEmployeeImportRow[];
  preview: ImportPreview;
  columnMappings: ImportColumnMapping[];
};

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-_]+/g, '').replace(/[^a-z0-9]/g, '');
}

function defaultCanonicalHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-]+/g, '_');
}

export function toCanonicalHeader(header: string): CanonicalEmployeeImportColumn | null {
  const alias = HEADER_ALIASES[normalizeHeaderKey(header)];
  return alias ?? null;
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

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s{2,}/g, ' ');
}

function normalizeEmail(value: string | undefined): string {
  return normalizeText(value).toLowerCase();
}

export function parseLooseNumber(value: string | undefined): number | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const stripped = raw
    .replace(/compa\s*ratio\s*:?/i, '')
    .replace(/[^0-9.,\-%]/g, '')
    .trim();
  if (!stripped) return null;

  const hasPercent = stripped.includes('%');
  const normalized = stripped.replace(/,/g, '').replace(/%/g, '');
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;

  return hasPercent ? parsed : parsed;
}

export function parseDate(value: string | undefined): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;

  const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  let year = 0;
  let month = 0;
  let day = 0;

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
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

function deriveNameParts(fullName: string): { firstName: string | null; lastName: string | null } {
  const value = normalizeText(fullName);
  if (!value) return { firstName: null, lastName: null };
  const pieces = value.split(' ');
  if (pieces.length === 1) return { firstName: pieces[0], lastName: null };
  return { firstName: pieces[0], lastName: pieces.slice(1).join(' ') };
}

function chooseEmployeeId(normalized: Partial<Record<CanonicalEmployeeImportColumn, string | number | null>>): string {
  const fromCanonical = normalizeText(String(normalized.employee_id ?? ''));
  if (fromCanonical) return fromCanonical;
  const fullName = normalizeText(String(normalized.full_name ?? ''));
  if (fullName) return `auto-${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return 'auto-missing-id';
}

export function prepareEmployeeImport(csvContent: string): ImportPreparation {
  let rawRows: Record<string, string>[] = [];
  try {
    rawRows = parseCsv(csvContent);
  } catch {
    return {
      rows: [],
      preview: {
        rowsReceived: 0,
        rowsNormalized: 0,
        rowsWithWarnings: 0,
        errors: [{ row: 1, message: 'CSV is unreadable or malformed' }],
        warnings: []
      },
      columnMappings: []
    };
  }

  if (rawRows.length === 0) {
    return {
      rows: [],
      preview: {
        rowsReceived: 0,
        rowsNormalized: 0,
        rowsWithWarnings: 0,
        errors: [{ row: 1, message: 'CSV must include at least one data row' }],
        warnings: []
      },
      columnMappings: []
    };
  }

  const headerKeys = Object.keys(rawRows[0] ?? {});
  const columnMappings: ImportColumnMapping[] = headerKeys.map((sourceColumn) => {
    const mapped = toCanonicalHeader(sourceColumn);
    return {
      sourceColumn,
      canonicalColumn: mapped,
      isRecognized: Boolean(mapped),
      confidence: mapped ? 1 : 0
    };
  });

  const warnings: RowValidationWarning[] = [];
  const rows = rawRows.map((sourceRow, index) => {
    const rowNumber = index + 2;
    const normalized: Partial<Record<CanonicalEmployeeImportColumn, string | number | null>> = {};
    const unmappedAttributes: Record<string, string> = {};
    const rowWarnings: string[] = [];

    for (const [sourceColumn, rawValue] of Object.entries(sourceRow)) {
      const mapped = toCanonicalHeader(sourceColumn);
      const value = normalizeText(rawValue);
      if (!mapped) {
        unmappedAttributes[defaultCanonicalHeader(sourceColumn)] = rawValue;
        continue;
      }

      switch (mapped) {
        case 'manager_email':
        case 'executive_email':
          normalized[mapped] = normalizeEmail(value) || null;
          break;
        case 'current_salary':
        case 'hourly_rate':
        case 'range_low':
        case 'range_mid':
        case 'range_high':
        case 'compa_ratio':
        case 'bonus_target_percent':
        case 'total_cash':
        case 'total_comp': {
          const parsed = parseLooseNumber(value);
          normalized[mapped] = parsed;
          if (value && parsed === null) {
            rowWarnings.push(`Could not parse numeric field ${mapped}; preserved raw value`);
            unmappedAttributes[`raw_${mapped}`] = rawValue;
          }
          break;
        }
        case 'hire_date':
        case 'start_date': {
          const parsed = parseDate(value);
          normalized[mapped] = parsed;
          if (value && !parsed) {
            rowWarnings.push(`Could not parse date field ${mapped}; preserved raw value`);
            unmappedAttributes[`raw_${mapped}`] = rawValue;
          }
          break;
        }
        default:
          normalized[mapped] = value || null;
      }
    }

    if (!normalized.full_name && (normalized.first_name || normalized.last_name)) {
      normalized.full_name = normalizeText(`${normalized.first_name ?? ''} ${normalized.last_name ?? ''}`);
    }

    if (normalized.full_name && (!normalized.first_name || !normalized.last_name)) {
      const derived = deriveNameParts(String(normalized.full_name));
      if (!normalized.first_name) normalized.first_name = derived.firstName;
      if (!normalized.last_name) normalized.last_name = derived.lastName;
    }

    if (!normalized.employee_id) {
      rowWarnings.push('Missing employee identifier; generated fallback id during ingest');
    }

    if (!normalized.current_salary) {
      rowWarnings.push('Missing current salary');
    }

    if (!normalized.bonus_target_percent) {
      rowWarnings.push('No bonus target provided');
    }

    rowWarnings.forEach((message) => warnings.push({ row: rowNumber, message }));

    return {
      rowNumber,
      employeeId: chooseEmployeeId(normalized),
      normalized,
      unmappedAttributes,
      warnings: rowWarnings
    };
  });

  return {
    rows,
    preview: {
      rowsReceived: rawRows.length,
      rowsNormalized: rows.length,
      rowsWithWarnings: rows.filter((row) => row.warnings.length > 0).length,
      errors: [],
      warnings
    },
    columnMappings
  };
}
