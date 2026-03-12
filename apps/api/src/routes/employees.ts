import { Router } from 'express';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
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
import { prepareEmployeeImport } from './employeeImport.js';

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

async function loadDbTargetInfo() {
  const result = await pool.query<{
    databaseName: string;
    schemaName: string;
  }>(
    `SELECT current_database() AS "databaseName",
            current_schema() AS "schemaName"`
  );
  return {
    databaseName: result.rows[0]?.databaseName ?? 'unknown',
    schemaName: result.rows[0]?.schemaName ?? 'unknown',
    tableName: 'employees'
  };
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
       WHERE lower(manager) = lower($1)
          OR lower(manager_email) = lower($2)
          OR lower(manager) = lower($2)
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
    const dbTarget = await loadDbTargetInfo();
    console.info('[employees.roster] Route hit', {
      actorEmail: req.user?.email,
      dbTarget
    });

    const { managerName: managerScopeName, managerEmail: managerScopeEmail } =
      getEffectiveManagerScope(req.user!);
    const employees = await fetchEmployeesFromDb(managerScopeName, managerScopeEmail);

    console.info('[employees.roster] Query completed', {
      actorEmail: req.user?.email,
      table: `${dbTarget.schemaName}.${dbTarget.tableName}`,
      rowCount: employees.length
    });

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
    const action = req.body?.action === 'commit' ? 'commit' : 'preview';
    console.info('[employees.import] Route hit', {
      actorEmail: req.user?.email,
      action
    });

    let csvContent = '';
    if (typeof req.body?.csvContent === 'string' && req.body.csvContent.trim()) {
      csvContent = req.body.csvContent;
    } else if (typeof req.body?.filePath === 'string' && req.body.filePath.trim()) {
      csvContent = await readFile(req.body.filePath, 'utf8');
    } else {
      res.status(400).json({ success: false, error: 'Provide csvContent or filePath' });
      return;
    }

    const prepared = prepareEmployeeImport(csvContent);
    const { rowsReceived, rowsValid, rowsInvalid, errors, warnings } = prepared.preview;

    console.info('[employees.import] Parsed and validated CSV', {
      actorEmail: req.user?.email,
      rowsReceived,
      rowsValid,
      rowsRejected: rowsInvalid
    });

    if (action === 'preview') {
      res.json({
        success: true,
        data: {
          rowsReceived,
          rowsValid,
          rowsInvalid,
          errors,
          warnings
        }
      });
      return;
    }

    if (rowsReceived === 0) {
      res.status(400).json({
        success: false,
        error: 'CSV must include at least one data row',
        data: {
          rowsReceived,
          rowsInserted: 0,
          rowsUpdated: 0,
          rowsRejected: rowsInvalid
        }
      });
      return;
    }

    if (rowsInvalid > 0 || errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'CSV validation failed. Fix errors and retry commit.',
        data: {
          rowsReceived,
          rowsInserted: 0,
          rowsUpdated: 0,
          rowsRejected: rowsInvalid,
          errors,
          warnings
        }
      });
      return;
    }

    console.info('[employees.import] Starting import transaction', {
      actorEmail: req.user?.email,
      rowsReceived,
      rowsValid,
      rowsRejected: rowsInvalid,
      dbTarget: await loadDbTargetInfo()
    });

    let inserted = 0;
    let updated = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of prepared.validRows) {
        const validation = employeeSchema.safeParse({
          id: row.id || randomUUID(),
          name: row.name,
          email: row.email,
          department: row.department,
          title: row.title,
          positionType: row.positionType,
          geography: row.geography,
          level: row.level,
          salary: row.salary,
          manager: row.manager,
          managerEmail: row.managerEmail,
          hireDate: row.hireDate
        });

        if (!validation.success) {
          throw new Error(`Row ${row.rowNumber} schema validation failed: ${validation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
        }

        const upsertResult = await client.query(
          `INSERT INTO employees (id, name, email, department, title, position_type, geography, level, salary, manager, manager_email, hire_date)
           VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF(lower($11), ''), NULLIF($12, '')::date)
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
          [
            validation.data.id,
            validation.data.name,
            validation.data.email ?? '',
            validation.data.department ?? '',
            validation.data.title ?? '',
            validation.data.positionType ?? '',
            validation.data.geography ?? '',
            validation.data.level ?? '',
            validation.data.salary,
            validation.data.manager ?? '',
            validation.data.managerEmail ?? '',
            validation.data.hireDate ?? ''
          ]
        );

        if (upsertResult.rowCount !== 1) {
          throw new Error(`Row ${row.rowNumber} upsert affected ${upsertResult.rowCount ?? 0} rows`);
        }

        if (upsertResult.rows[0]?.inserted) inserted += 1;
        else updated += 1;
      }

      await client.query('COMMIT');
      console.info('[employees.import] Import transaction committed', {
        actorEmail: req.user?.email,
        rowsReceived,
        rowsValid,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsRejected: rowsInvalid
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[employees.import] Import transaction rolled back', {
        actorEmail: req.user?.email,
        rowsReceived,
        rowsValid,
        rowsInserted: inserted,
        rowsUpdated: updated,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      client.release();
    }

    await logAuditEvent({
      actionType: 'employee.imported',
      actorEmail: req.user!.email,
      targetEntity: 'employees',
      targetId: 'import-csv',
      metadata: {
        rowsReceived,
        rowsValid,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsRejected: rowsInvalid,
        unknownColumns: prepared.unknownColumns
      }
    });

    res.json({
      success: true,
      data: {
        rowsReceived,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsRejected: rowsInvalid
      }
    });
  } catch (error) {
    next(error);
  }
});
