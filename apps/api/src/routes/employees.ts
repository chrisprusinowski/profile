import { Router } from 'express';
import { readFile } from 'fs/promises';
import { z } from 'zod';
import {
  getManagerScopeEmail,
  getManagerScopeName,
  requireRole,
  type AuthenticatedRequest
} from '../auth.js';
import { pool } from '../db.js';
import { findBestPayRange, type PayRangeRecord } from '../payRanges.js';
import { logAuditEvent } from '../audit.js';

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

const requiredCsvColumns = ['id', 'name', 'email', 'department', 'title', 'salary', 'manager', 'hire_date'];

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

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
}

function parseDateInput(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
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
    const managerScopeName = getManagerScopeName(req.user!);
    const managerScopeEmail =
      getManagerScopeEmail(req.user!) ?? req.user?.email?.toLowerCase() ?? null;
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
                 to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"`,
      [employee.id, employee.name, employee.email ?? '', employee.department ?? '', employee.title ?? '', employee.positionType ?? '', employee.geography ?? '', employee.level ?? '', employee.salary, employee.manager ?? '', employee.managerEmail ?? '', hireDate],
    );

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
                 to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"`,
      [parsed.data.name, parsed.data.email ?? '', parsed.data.department ?? '', parsed.data.title ?? '', parsed.data.positionType ?? '', parsed.data.geography ?? '', parsed.data.level ?? '', parsed.data.salary, parsed.data.manager ?? '', parsed.data.managerEmail ?? '', hireDate, req.params.id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Employee not found' });
      return;
    }

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

    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      res.status(400).json({ success: false, error: 'CSV must include header and at least one data row' });
      return;
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    const missingColumns = requiredCsvColumns.filter((column) => !headers.includes(column));

    if (missingColumns.length > 0) {
      res.status(400).json({ success: false, error: `Missing required columns: ${missingColumns.join(', ')}` });
      return;
    }

    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    const validationErrors: Array<{ row: number; error: string }> = [];

    for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
      const rowNumber = rowIndex + 1;
      const values = parseCsvLine(lines[rowIndex]);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? '';
      });

      const validation = employeeSchema.safeParse({
        id: row.id,
        name: row.name,
        email: row.email,
        department: row.department,
        title: row.title,
        positionType: row.position_type,
        geography: row.geography,
        level: row.level,
        salary: row.salary,
        manager: row.manager,
        managerEmail: row.manager_email,
        hireDate: row.hire_date,
      });

      if (!validation.success) {
        rejected += 1;
        validationErrors.push({ row: rowNumber, error: validation.error.issues.map((issue) => issue.message).join('; ') });
        continue;
      }

      const hireDate = parseDateInput(validation.data.hireDate);
      if (validation.data.hireDate && !hireDate) {
        rejected += 1;
        validationErrors.push({ row: rowNumber, error: 'hire_date must be a valid date (YYYY-MM-DD)' });
        continue;
      }

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
