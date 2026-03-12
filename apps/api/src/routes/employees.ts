import { Router } from 'express';
import { readFile } from 'fs/promises';
import { z } from 'zod';
import {
  getEffectiveManagerScope,
  requireRole,
  type AuthenticatedRequest
} from '../auth.js';
import { pool } from '../db.js';
import { findBestPayRange, type PayRangeRecord } from '../payRanges.js';
import { logAuditEvent } from '../audit.js';
import { recalculateRecommendationAmountsForEmployee } from '../recommendationCalculations.js';

export const employeesRouter = Router();

const employeeSchema = z.object({
  id: z.string().trim().min(1, 'id is required').max(128),
  name: z.string().trim().min(1, 'name is required').max(255),
  email: z.string().trim().email('email must be valid').max(255).optional().or(z.literal('')),
  department: z.string().trim().max(255).optional().or(z.literal('')),
  title: z.string().trim().max(255).optional().or(z.literal('')),
  positionType: z.string().trim().max(255).optional().or(z.literal('')),
  geography: z.string().trim().max(255).optional().or(z.literal('')),
  level: z.string().trim().max(64).optional().or(z.literal('')),
  salary: z.coerce.number().finite().min(0, 'salary must be >= 0'),
  manager: z.string().trim().max(255).optional().or(z.literal('')),
  managerEmail: z.string().trim().email().optional().or(z.literal('')),
  hireDate: z.string().trim().optional().or(z.literal('')),
});

const employeeUpdateSchema = employeeSchema.omit({ id: true });

const MINIMUM_CSV_COLUMNS = ['name', 'salary'];

/** Header alias map: normalized key → canonical column name */
const HEADER_ALIASES: Record<string, string> = {
  // id
  id: 'id', employeeid: 'id', empid: 'id', eid: 'id', employeenumber: 'id',
  // name
  name: 'name', fullname: 'name', employeename: 'name', displayname: 'name',
  // email
  email: 'email', emailaddress: 'email', mail: 'email', workemail: 'email', e_mail: 'email',
  // department
  department: 'department', dept: 'department', division: 'department', team: 'department',
  businessunit: 'department',
  // title
  title: 'title', jobtitle: 'title', role: 'title', jobname: 'title',
  // salary
  salary: 'salary', basesalary: 'salary', annualsalary: 'salary', basepay: 'salary',
  compensation: 'salary', pay: 'salary', wage: 'salary', currentsalary: 'salary',
  currentsal: 'salary', currentbase: 'salary', annualbase: 'salary',
  // manager
  manager: 'manager', managername: 'manager', supervisor: 'manager', reportsto: 'manager',
  mgr: 'manager', directmanager: 'manager',
  // hire_date
  hire_date: 'hire_date', hiredate: 'hire_date', startdate: 'hire_date',
  dateofhire: 'hire_date', joindate: 'hire_date', datestarted: 'hire_date',
  employmentdate: 'hire_date', start_date: 'hire_date', datehired: 'hire_date',
  // position_type
  position_type: 'position_type', positiontype: 'position_type', emptype: 'position_type',
  employeetype: 'position_type', employmenttype: 'position_type',
  // geography
  geography: 'geography', geo: 'geography', location: 'geography', region: 'geography',
  country: 'geography', office: 'geography', worklocation: 'geography',
  // level
  level: 'level', grade: 'level', band: 'level', joblevel: 'level', jobgrade: 'level',
  careerlevel: 'level',
  // manager_email
  manager_email: 'manager_email', manageremail: 'manager_email', managermail: 'manager_email',
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/** Normalize a raw header string to its canonical column name via alias lookup */
function normalizeHeader(header: string): string {
  const key = header.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  return HEADER_ALIASES[key] || header.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
}

/** Normalize salary string: strip currency symbols, commas, whitespace → number */
function normalizeSalaryValue(raw: string): number | null {
  if (!raw || !raw.trim()) return 0;
  const cleaned = raw.replace(/[$€£¥,\s]/g, '');
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  if (isNaN(n) || !isFinite(n)) return null;
  if (n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Normalize a text field: trim and collapse multiple whitespace */
function normalizeTextField(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/\s{2,}/g, ' ');
}

/** Parse and normalize date input to YYYY-MM-DD. Accepts ISO, US, and natural date formats. */
function parseDateInput(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let year: number | undefined, month: number | undefined, day: number | undefined;

  // ISO: YYYY-MM-DD or YYYY/MM/DD
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  }

  // US: MM/DD/YYYY or MM-DD-YYYY
  if (!m) {
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
    if (m) {
      month = Number(m[1]);
      day = Number(m[2]);
      year = Number(m[3]);
    }
  }

  // Natural: "Jan 15, 2021" or "January 15 2021"
  if (!m) {
    const MONTHS: Record<string, number> = {
      jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
      may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,
      sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12
    };

    let wm = /^([a-z]+)\s+(\d{1,2}),?\s*(\d{4})$/i.exec(trimmed);
    if (wm) {
      const mn = MONTHS[wm[1].toLowerCase()];
      if (mn) { month = mn; day = Number(wm[2]); year = Number(wm[3]); m = wm; }
    }

    if (!m) {
      wm = /^(\d{1,2})[-\s]+([a-z]+)[-\s,]+(\d{4})$/i.exec(trimmed);
      if (wm) {
        const mn = MONTHS[wm[2].toLowerCase()];
        if (mn) { month = mn; day = Number(wm[1]); year = Number(wm[3]); m = wm; }
      }
    }
  }

  if (year === undefined || month === undefined || day === undefined) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

async function loadPayRanges(): Promise<PayRangeRecord[]> {
  const result = await pool.query(
    `SELECT id,
            range_name AS "rangeName",
            job_family AS "jobFamily",
            position_type AS "positionType",
            job_title_reference AS "jobTitleReference",
            level,
            geography,
            geo_tier AS "geoTier",
            currency,
            salary_min::float AS "salaryMin",
            salary_mid::float AS "salaryMid",
            salary_max::float AS "salaryMax",
            to_char(effective_date, 'YYYY-MM-DD') AS "effectiveDate",
            is_active AS "isActive"
     FROM pay_ranges
     WHERE is_active = true`
  );
  return result.rows;
}

async function fetchEmployeesFromDb(
  managerScopeName: string | null,
  managerScopeEmail: string | null
) {
  const shouldScope = Boolean(managerScopeName || managerScopeEmail);
  const result = shouldScope
    ? await pool.query(
      `SELECT id,
              name,
              email,
              department,
              title,
              position_type AS "positionType",
              geography,
              level,
              salary::float AS salary,
              manager,
              manager_email AS "managerEmail",
              to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"
       FROM employees
       WHERE lower(manager) = lower($1) OR lower(manager_email) = lower($2)
       ORDER BY name ASC, id ASC`,
      [managerScopeName, managerScopeEmail],
    )
    : await pool.query(
      `SELECT id,
              name,
              email,
              department,
              title,
              position_type AS "positionType",
              geography,
              level,
              salary::float AS salary,
              manager,
              manager_email AS "managerEmail",
              to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"
       FROM employees
       ORDER BY name ASC, id ASC`,
    );

  const ranges = await loadPayRanges();
  return result.rows.map((employee) => ({
    ...employee,
    payRange: findBestPayRange(employee, ranges)
  }));
}

employeesRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { managerName: managerScopeName, managerEmail: managerScopeEmail } =
      getEffectiveManagerScope(req.user!);
    const employees = await fetchEmployeesFromDb(managerScopeName, managerScopeEmail);
    res.json({ success: true, data: employees });
  } catch (error) {
    next(error);
  }
});

employeesRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const employee = parsed.data;
    const hireDate = parseDateInput(employee.hireDate);
    if (employee.hireDate && !hireDate) {
      res.status(400).json({ success: false, error: 'hireDate must be a valid date (YYYY-MM-DD)' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO employees (id, name, email, department, title, position_type, geography, level, salary, manager, manager_email, hire_date)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF(lower($11), ''), $12)
       RETURNING id,
                 name,
                 email,
                 department,
                 title,
                 position_type AS "positionType",
                 geography,
                 level,
                 salary::float AS salary,
                 manager,
                 manager_email AS "managerEmail",
                 to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"`,
      [employee.id, employee.name, employee.email ?? '', employee.department ?? '', employee.title ?? '', employee.positionType ?? '', employee.geography ?? '', employee.level ?? '', employee.salary, employee.manager ?? '', employee.managerEmail ?? '', hireDate],
    );

    await recalculateRecommendationAmountsForEmployee(result.rows[0].id);
    const ranges = await loadPayRanges();
    await logAuditEvent({ actionType: 'employee.created', actorEmail: req.user!.email, targetEntity: 'employees', targetId: result.rows[0].id, newValues: result.rows[0] });
    res.status(201).json({ success: true, data: { ...result.rows[0], payRange: findBestPayRange(result.rows[0], ranges) } });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ success: false, error: 'Employee with this id already exists' });
      return;
    }
    next(error);
  }
});

employeesRouter.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const parsed = employeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const hireDate = parseDateInput(parsed.data.hireDate);
    if (parsed.data.hireDate && !hireDate) {
      res.status(400).json({ success: false, error: 'hireDate must be a valid date (YYYY-MM-DD)' });
      return;
    }

    const result = await pool.query(
      `UPDATE employees
       SET name = $1,
           email = NULLIF($2, ''),
           department = NULLIF($3, ''),
           title = NULLIF($4, ''),
           position_type = NULLIF($5, ''),
           geography = NULLIF($6, ''),
           level = NULLIF($7, ''),
           salary = $8,
           manager = NULLIF($9, ''),
           manager_email = NULLIF(lower($10), ''),
           hire_date = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING id,
                 name,
                 email,
                 department,
                 title,
                 position_type AS "positionType",
                 geography,
                 level,
                 salary::float AS salary,
                 manager,
                 manager_email AS "managerEmail",
                 to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"`,
      [parsed.data.name, parsed.data.email ?? '', parsed.data.department ?? '', parsed.data.title ?? '', parsed.data.positionType ?? '', parsed.data.geography ?? '', parsed.data.level ?? '', parsed.data.salary, parsed.data.manager ?? '', parsed.data.managerEmail ?? '', hireDate, req.params.id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Employee not found' });
      return;
    }

    await recalculateRecommendationAmountsForEmployee(String(req.params.id));
    const ranges = await loadPayRanges();
    await logAuditEvent({ actionType: 'employee.updated', actorEmail: req.user!.email, targetEntity: 'employees', targetId: String(req.params.id), newValues: result.rows[0] });
    res.json({ success: true, data: { ...result.rows[0], payRange: findBestPayRange(result.rows[0], ranges) } });
  } catch (error) {
    next(error);
  }
});

employeesRouter.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Employee not found' });
      return;
    }

    await logAuditEvent({ actionType: 'employee.deleted', actorEmail: req.user!.email, targetEntity: 'employees', targetId: result.rows[0].id });
    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    next(error);
  }
});

employeesRouter.post('/import-csv', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    let csvContent = '';
    if (typeof req.body?.csvContent === 'string' && req.body.csvContent.trim()) {
      csvContent = req.body.csvContent;
    } else if (typeof req.body?.filePath === 'string' && req.body.filePath.trim()) {
      csvContent = await readFile(req.body.filePath, 'utf8');
    } else {
      res.status(400).json({ success: false, error: 'Provide csvContent or filePath' });
      return;
    }

    // Strip BOM
    csvContent = csvContent.replace(/^\uFEFF/, '');

    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      res.status(400).json({ success: false, error: 'CSV must include header and at least one data row' });
      return;
    }

    const rawHeaders = parseCsvLine(lines[0]);
    const headers = rawHeaders.map(normalizeHeader);

    // Check for minimum required columns (name + salary)
    const missingColumns = MINIMUM_CSV_COLUMNS.filter((column) => !headers.includes(column));
    if (missingColumns.length > 0) {
      res.status(400).json({ success: false, error: `Missing required columns: ${missingColumns.join(', ')}. Headers found: ${headers.join(', ')}` });
      return;
    }

    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    let autoIdCounter = 0;
    const validationErrors: Array<{ row: number; error: string }> = [];

    for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
      const rowNumber = rowIndex + 1;
      const values = parseCsvLine(lines[rowIndex]);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? '';
      });

      // Normalize fields before validation
      const name = normalizeTextField(row.name);
      if (!name) {
        rejected += 1;
        validationErrors.push({ row: rowNumber, error: 'name is required' });
        continue;
      }

      // Salary normalization: handle $78,000 / 78000 / $78,000.00
      const salaryVal = normalizeSalaryValue(row.salary || '');
      if (salaryVal === null) {
        rejected += 1;
        validationErrors.push({ row: rowNumber, error: `could not parse salary "${row.salary}"` });
        continue;
      }

      // Auto-generate ID if not provided
      autoIdCounter++;
      const rawId = normalizeTextField(row.id);
      const id = rawId || `emp-import-${autoIdCounter}-${name.replace(/\s+/g, '').slice(0, 8).toLowerCase()}`;

      // Date normalization
      const hireDate = parseDateInput(row.hire_date);
      if (row.hire_date && row.hire_date.trim() && !hireDate) {
        validationErrors.push({ row: rowNumber, error: `could not parse hire_date "${row.hire_date}" — stored as null` });
        // Don't reject — store with null date
      }

      // Email normalization
      const email = (row.email || '').trim().toLowerCase();

      const department = normalizeTextField(row.department);
      const title = normalizeTextField(row.title);
      const manager = normalizeTextField(row.manager);
      const managerEmail = (row.manager_email || '').trim().toLowerCase();
      const positionType = normalizeTextField(row.position_type);
      const geography = normalizeTextField(row.geography);
      const level = normalizeTextField(row.level);

      // Validate with schema (after normalization)
      const validation = employeeSchema.safeParse({
        id,
        name,
        email,
        department,
        title,
        positionType,
        geography,
        level,
        salary: salaryVal,
        manager,
        managerEmail,
        hireDate: hireDate || '',
      });

      if (!validation.success) {
        rejected += 1;
        validationErrors.push({ row: rowNumber, error: validation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
        continue;
      }

      try {
        const upsertResult = await pool.query(
          `INSERT INTO employees (id, name, email, department, title, position_type, geography, level, salary, manager, manager_email, hire_date)
           VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF(lower($11), ''), $12)
           ON CONFLICT (id)
           DO UPDATE SET name = EXCLUDED.name,
                         email = EXCLUDED.email,
                         department = EXCLUDED.department,
                         title = EXCLUDED.title,
                         position_type = EXCLUDED.position_type,
                         geography = EXCLUDED.geography,
                         level = EXCLUDED.level,
                         salary = EXCLUDED.salary,
                         manager = EXCLUDED.manager,
                         manager_email = EXCLUDED.manager_email,
                         hire_date = EXCLUDED.hire_date,
                         updated_at = NOW()
           RETURNING xmax = 0 AS inserted`,
          [validation.data.id, validation.data.name, validation.data.email ?? '', validation.data.department ?? '', validation.data.title ?? '', validation.data.positionType ?? '', validation.data.geography ?? '', validation.data.level ?? '', validation.data.salary, validation.data.manager ?? '', validation.data.managerEmail ?? '', hireDate],
        );

        if (upsertResult.rows[0]?.inserted) {
          inserted += 1;
        } else {
          updated += 1;
        }
      } catch (dbError) {
        rejected += 1;
        const msg = dbError instanceof Error ? dbError.message : 'database error';
        validationErrors.push({ row: rowNumber, error: `database error: ${msg}` });
      }
    }

    await logAuditEvent({ actionType: 'employee.imported', actorEmail: req.user!.email, targetEntity: 'employees', targetId: 'import-csv', metadata: { rowsProcessed: lines.length - 1, inserted, updated, rejected } });
    res.json({
      success: true,
      data: {
        rowsProcessed: lines.length - 1,
        inserted,
        updated,
        rejected,
        validationErrors,
      },
    });
  } catch (error) {
    next(error);
  }
});
