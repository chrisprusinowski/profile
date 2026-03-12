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
import { prepareEmployeeImport, type CanonicalEmployeeImportColumn } from './employeeImport.js';

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
    const { rowsReceived, rowsNormalized, rowsWithWarnings, errors, warnings } = prepared.preview;

    console.info('[employees.import] Parsed and validated CSV', {
      actorEmail: req.user?.email,
      rowsReceived,
      rowsNormalized,
      rowsWithWarnings
    });

    if (action === 'preview') {
      res.json({
        success: true,
        data: {
          rowsReceived,
          rowsNormalized,
          rowsWithWarnings,
          errors,
          warnings,
          columnMappings: prepared.columnMappings
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
          rowsWithWarnings: rowsWithWarnings
        }
      });
      return;
    }

    console.info('[employees.import] Starting import transaction', {
      actorEmail: req.user?.email,
      rowsReceived,
      rowsNormalized,
      rowsWithWarnings,
      dbTarget: await loadDbTargetInfo()
    });

    let inserted = 0;
    let updated = 0;
    let batchId = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batchInsert = await client.query<{ id: number }>(
        `INSERT INTO import_batches (source_type, source_name, actor_email, action, status, rows_received, rows_normalized, rows_with_warnings, rows_failed, warnings, metadata)
         VALUES ('csv', NULLIF($1, ''), $2, 'commit', 'processed', $3, $4, $5, 0, $6::jsonb, $7::jsonb)
         RETURNING id`,
        [req.body?.sourceName ?? '', req.user?.email ?? null, rowsReceived, rowsNormalized, rowsWithWarnings, JSON.stringify(warnings), JSON.stringify({ errors })]
      );
      batchId = batchInsert.rows[0]?.id ?? 0;

      for (const mapping of prepared.columnMappings) {
        await client.query(
          `INSERT INTO import_column_mappings (batch_id, source_column, canonical_column, is_recognized, confidence)
           VALUES ($1, $2, $3, $4, $5)`,
          [batchId, mapping.sourceColumn, mapping.canonicalColumn, mapping.isRecognized, mapping.confidence]
        );
      }

      for (const row of prepared.rows) {
        const normalized = row.normalized;
        const normalizedForStorage: Record<string, string | number | null> = {};
        for (const [key, value] of Object.entries(normalized)) {
          normalizedForStorage[key] = value ?? null;
        }

        const employeeId = String(normalized.employee_id ?? row.employeeId ?? randomUUID());
        const fullName = String(normalized.full_name ?? '').trim();
        const firstName = String(normalized.first_name ?? '').trim();
        const lastName = String(normalized.last_name ?? '').trim();
        const currentSalary = typeof normalized.current_salary === 'number' ? normalized.current_salary : null;

        const valuesByCanonical: Partial<Record<CanonicalEmployeeImportColumn, string | number | null>> = {
          ...normalized,
          employee_id: employeeId,
          full_name: fullName || null,
          first_name: firstName || null,
          last_name: lastName || null
        };

        await client.query(
          `INSERT INTO imported_employee_rows (batch_id, row_number, employee_id, raw_row_json, normalized_row_json, unmapped_attributes, row_warnings)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)`,
          [batchId, row.rowNumber, employeeId, JSON.stringify(row), JSON.stringify(normalizedForStorage), JSON.stringify(row.unmappedAttributes), JSON.stringify(row.warnings)]
        );

        const upsertResult = await client.query(
          `INSERT INTO employees (id, name, email, department, title, position_type, geography, level, salary, manager, manager_email, hire_date, first_name, last_name, full_name, job_family_group, job_family, business_entity, employment_classification, flsa_status, hourly_rate, range_low, range_mid, range_high, compa_ratio, bonus_target_percent, total_cash, total_comp, raw_attributes, import_batch_id)
           VALUES ($1, NULLIF($2, ''), NULLIF(lower($3), ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF(lower($11), ''), NULLIF($12, '')::date, NULLIF($13, ''), NULLIF($14, ''), NULLIF($15, ''), NULLIF($16, ''), NULLIF($17, ''), NULLIF($18, ''), NULLIF($19, ''), NULLIF($20, ''), $21, $22, $23, $24, $25, $26, $27, $28, $29::jsonb, $30)
           ON CONFLICT (id)
           DO UPDATE SET name = COALESCE(EXCLUDED.name, employees.name),
                         email = EXCLUDED.email,
                         department = EXCLUDED.department,
                         title = EXCLUDED.title,
                         position_type = EXCLUDED.position_type,
                         geography = EXCLUDED.geography,
                         level = EXCLUDED.level,
                         salary = COALESCE(EXCLUDED.salary, employees.salary),
                         manager = EXCLUDED.manager,
                         manager_email = EXCLUDED.manager_email,
                         hire_date = EXCLUDED.hire_date,
                         first_name = EXCLUDED.first_name,
                         last_name = EXCLUDED.last_name,
                         full_name = EXCLUDED.full_name,
                         job_family_group = EXCLUDED.job_family_group,
                         job_family = EXCLUDED.job_family,
                         business_entity = EXCLUDED.business_entity,
                         employment_classification = EXCLUDED.employment_classification,
                         flsa_status = EXCLUDED.flsa_status,
                         hourly_rate = EXCLUDED.hourly_rate,
                         range_low = EXCLUDED.range_low,
                         range_mid = EXCLUDED.range_mid,
                         range_high = EXCLUDED.range_high,
                         compa_ratio = EXCLUDED.compa_ratio,
                         bonus_target_percent = EXCLUDED.bonus_target_percent,
                         total_cash = EXCLUDED.total_cash,
                         total_comp = EXCLUDED.total_comp,
                         raw_attributes = COALESCE(employees.raw_attributes, '{}'::jsonb) || COALESCE(EXCLUDED.raw_attributes, '{}'::jsonb),
                         import_batch_id = EXCLUDED.import_batch_id,
                         updated_at = NOW()
           RETURNING xmax = 0 AS inserted`,
          [
            employeeId,
            fullName,
            valuesByCanonical.manager_email ?? '',
            valuesByCanonical.department ?? '',
            valuesByCanonical.job_title ?? '',
            '',
            valuesByCanonical.geo ?? valuesByCanonical.location ?? '',
            valuesByCanonical.level ?? '',
            currentSalary,
            valuesByCanonical.manager_name ?? '',
            valuesByCanonical.manager_email ?? '',
            valuesByCanonical.hire_date ?? valuesByCanonical.start_date ?? '',
            firstName,
            lastName,
            fullName,
            valuesByCanonical.job_family_group ?? '',
            valuesByCanonical.job_family ?? '',
            valuesByCanonical.business_entity ?? '',
            valuesByCanonical.employment_classification ?? '',
            valuesByCanonical.flsa_status ?? '',
            typeof valuesByCanonical.hourly_rate === 'number' ? valuesByCanonical.hourly_rate : null,
            typeof valuesByCanonical.range_low === 'number' ? valuesByCanonical.range_low : null,
            typeof valuesByCanonical.range_mid === 'number' ? valuesByCanonical.range_mid : null,
            typeof valuesByCanonical.range_high === 'number' ? valuesByCanonical.range_high : null,
            typeof valuesByCanonical.compa_ratio === 'number' ? valuesByCanonical.compa_ratio : null,
            typeof valuesByCanonical.bonus_target_percent === 'number' ? valuesByCanonical.bonus_target_percent : null,
            typeof valuesByCanonical.total_cash === 'number' ? valuesByCanonical.total_cash : null,
            typeof valuesByCanonical.total_comp === 'number' ? valuesByCanonical.total_comp : null,
            JSON.stringify(row.unmappedAttributes),
            batchId
          ]
        );

        if (upsertResult.rowCount !== 1) {
          throw new Error(`Row ${row.rowNumber} upsert affected ${upsertResult.rowCount ?? 0} rows`);
        }

        if (upsertResult.rows[0]?.inserted) inserted += 1;
        else updated += 1;

        await recalculateRecommendationAmountsForEmployee(employeeId);
      }

      await client.query('COMMIT');
      console.info('[employees.import] Import transaction committed', {
        actorEmail: req.user?.email,
        rowsReceived,
        rowsNormalized,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsWithWarnings,
        batchId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[employees.import] Import transaction rolled back', {
        actorEmail: req.user?.email,
        rowsReceived,
        rowsNormalized,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsWithWarnings,
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
        rowsNormalized,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsWithWarnings,
        batchId
      }
    });

    res.json({
      success: true,
      data: {
        rowsReceived,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsWithWarnings,
        batchId
      }
    });
  } catch (error) {
    next(error);
  }
});
