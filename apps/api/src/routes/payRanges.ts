import { Router } from 'express';
import { z } from 'zod';
import { requireRole, type AuthenticatedRequest } from '../auth.js';
import { pool } from '../db.js';
import { logAuditEvent } from '../audit.js';

export const payRangesRouter = Router();

const payRangeSchema = z.object({
  rangeName: z.string().trim().max(255).optional().nullable(),
  jobFamily: z.string().trim().max(255).optional().nullable(),
  positionType: z.string().trim().max(255).optional().nullable(),
  jobTitleReference: z.string().trim().max(255).optional().nullable(),
  level: z.string().trim().max(64).optional().nullable(),
  geography: z.string().trim().max(255).optional().nullable(),
  geoTier: z.string().trim().max(64).optional().nullable(),
  currency: z.string().trim().max(16).optional().nullable(),
  salaryMin: z.coerce.number().finite().min(0),
  salaryMid: z.coerce.number().finite().min(0),
  salaryMax: z.coerce.number().finite().min(0),
  effectiveDate: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional()
});

const requiredCsvColumns = ['position_type', 'geography', 'salary_min', 'salary_mid', 'salary_max'];

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

function parseDate(value?: string | null): string | null {
  if (!value || !value.trim()) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

const selectSql = `SELECT id,
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
    is_active AS "isActive",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
   FROM pay_ranges`;

payRangesRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive', 'manager'])) return;
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const result = await pool.query(
      `${selectSql} ${includeInactive ? '' : 'WHERE is_active = true'} ORDER BY position_type NULLS LAST, geography NULLS LAST, level NULLS LAST, id DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

payRangesRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const parsed = payRangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    if (payload.salaryMin > payload.salaryMid || payload.salaryMid > payload.salaryMax) {
      res.status(400).json({ success: false, error: 'salary_min <= salary_mid <= salary_max is required' });
      return;
    }

    const effectiveDate = parseDate(payload.effectiveDate);
    if (payload.effectiveDate && !effectiveDate) {
      res.status(400).json({ success: false, error: 'effectiveDate must be a valid date' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO pay_ranges (range_name, job_family, position_type, job_title_reference, level, geography, geo_tier, currency, salary_min, salary_mid, salary_max, effective_date, is_active)
       VALUES (NULLIF($1,''), NULLIF($2,''), NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), COALESCE(NULLIF($8,''), 'USD'), $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        payload.rangeName ?? '', payload.jobFamily ?? '', payload.positionType ?? '', payload.jobTitleReference ?? '', payload.level ?? '', payload.geography ?? '', payload.geoTier ?? '', payload.currency ?? 'USD', payload.salaryMin, payload.salaryMid, payload.salaryMax, effectiveDate, payload.isActive ?? true
      ]
    );

    const row = await pool.query(`${selectSql} WHERE id = $1`, [result.rows[0].id]);
    res.status(201).json({ success: true, data: row.rows[0] });
  } catch (error) {
    next(error);
  }
});

payRangesRouter.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const parsed = payRangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    if (payload.salaryMin > payload.salaryMid || payload.salaryMid > payload.salaryMax) {
      res.status(400).json({ success: false, error: 'salary_min <= salary_mid <= salary_max is required' });
      return;
    }

    const effectiveDate = parseDate(payload.effectiveDate);
    if (payload.effectiveDate && !effectiveDate) {
      res.status(400).json({ success: false, error: 'effectiveDate must be a valid date' });
      return;
    }

    const result = await pool.query(
      `UPDATE pay_ranges
       SET range_name = NULLIF($1,''),
           job_family = NULLIF($2,''),
           position_type = NULLIF($3,''),
           job_title_reference = NULLIF($4,''),
           level = NULLIF($5,''),
           geography = NULLIF($6,''),
           geo_tier = NULLIF($7,''),
           currency = COALESCE(NULLIF($8,''), 'USD'),
           salary_min = $9,
           salary_mid = $10,
           salary_max = $11,
           effective_date = $12,
           is_active = COALESCE($13, is_active),
           updated_at = NOW()
       WHERE id = $14
       RETURNING id`,
      [
        payload.rangeName ?? '', payload.jobFamily ?? '', payload.positionType ?? '', payload.jobTitleReference ?? '', payload.level ?? '', payload.geography ?? '', payload.geoTier ?? '', payload.currency ?? 'USD', payload.salaryMin, payload.salaryMid, payload.salaryMax, effectiveDate, payload.isActive, Number(req.params.id)
      ]
    );

    if (!result.rowCount) {
      res.status(404).json({ success: false, error: 'Pay range not found' });
      return;
    }

    const row = await pool.query(`${selectSql} WHERE id = $1`, [Number(req.params.id)]);
    res.json({ success: true, data: row.rows[0] });
  } catch (error) {
    next(error);
  }
});

payRangesRouter.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const result = await pool.query(
      `UPDATE pay_ranges SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [Number(req.params.id)]
    );
    if (!result.rowCount) {
      res.status(404).json({ success: false, error: 'Pay range not found' });
      return;
    }
    res.json({ success: true, data: { id: result.rows[0].id, deactivated: true } });
  } catch (error) {
    next(error);
  }
});

payRangesRouter.post('/import-csv', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const csvContent = String(req.body?.csvContent ?? '');
    if (!csvContent.trim()) {
      res.status(400).json({ success: false, error: 'csvContent is required' });
      return;
    }

    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      res.status(400).json({ success: false, error: 'CSV must include header and at least one data row' });
      return;
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    const missing = requiredCsvColumns.filter((column) => !headers.includes(column));
    if (missing.length) {
      res.status(400).json({ success: false, error: `Missing required columns: ${missing.join(', ')}` });
      return;
    }

    let processed = 0;
    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    const validationErrors: Array<{ row: number; error: string }> = [];

    for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
      const rowNum = lineIdx + 1;
      const values = parseCsvLine(lines[lineIdx]);
      const row = Object.fromEntries(headers.map((h, idx) => [h, values[idx] ?? '']));

      const parsed = payRangeSchema.safeParse({
        rangeName: row.range_name,
        jobFamily: row.job_family,
        positionType: row.position_type,
        jobTitleReference: row.job_title_reference || row.title,
        level: row.level,
        geography: row.geography,
        geoTier: row.geo_tier,
        currency: row.currency,
        salaryMin: row.salary_min,
        salaryMid: row.salary_mid,
        salaryMax: row.salary_max,
        effectiveDate: row.effective_date,
        isActive: row.is_active ? String(row.is_active).toLowerCase() !== 'false' : true
      });

      if (!parsed.success) {
        rejected++;
        validationErrors.push({ row: rowNum, error: parsed.error.issues.map((i) => i.message).join('; ') });
        continue;
      }

      const payload = parsed.data;
      if (payload.salaryMin > payload.salaryMid || payload.salaryMid > payload.salaryMax) {
        rejected++;
        validationErrors.push({ row: rowNum, error: 'salary_min <= salary_mid <= salary_max is required' });
        continue;
      }

      const effectiveDate = parseDate(payload.effectiveDate);
      if (payload.effectiveDate && !effectiveDate) {
        rejected++;
        validationErrors.push({ row: rowNum, error: 'effective_date must be a valid date' });
        continue;
      }

      processed++;

      const existing = await pool.query(
        `SELECT id FROM pay_ranges
         WHERE COALESCE(lower(position_type), '') = COALESCE(lower($1), '')
           AND COALESCE(lower(job_family), '') = COALESCE(lower($2), '')
           AND COALESCE(lower(job_title_reference), '') = COALESCE(lower($3), '')
           AND COALESCE(lower(level), '') = COALESCE(lower($4), '')
           AND COALESCE(lower(geography), '') = COALESCE(lower($5), '')
           AND COALESCE(lower(geo_tier), '') = COALESCE(lower($6), '')
           AND COALESCE(lower(currency), 'usd') = COALESCE(lower($7), 'usd')
         ORDER BY id DESC
         LIMIT 1`,
        [payload.positionType ?? '', payload.jobFamily ?? '', payload.jobTitleReference ?? '', payload.level ?? '', payload.geography ?? '', payload.geoTier ?? '', payload.currency ?? 'USD']
      );

      if (existing.rowCount) {
        await pool.query(
          `UPDATE pay_ranges
           SET range_name = NULLIF($1,''), salary_min = $2, salary_mid = $3, salary_max = $4, effective_date = $5, is_active = COALESCE($6, is_active), updated_at = NOW()
           WHERE id = $7`,
          [payload.rangeName ?? '', payload.salaryMin, payload.salaryMid, payload.salaryMax, effectiveDate, payload.isActive, existing.rows[0].id]
        );
        updated++;
      } else {
        await pool.query(
          `INSERT INTO pay_ranges (range_name, job_family, position_type, job_title_reference, level, geography, geo_tier, currency, salary_min, salary_mid, salary_max, effective_date, is_active)
           VALUES (NULLIF($1,''), NULLIF($2,''), NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), COALESCE(NULLIF($8,''), 'USD'), $9, $10, $11, $12, $13)`,
          [payload.rangeName ?? '', payload.jobFamily ?? '', payload.positionType ?? '', payload.jobTitleReference ?? '', payload.level ?? '', payload.geography ?? '', payload.geoTier ?? '', payload.currency ?? 'USD', payload.salaryMin, payload.salaryMid, payload.salaryMax, effectiveDate, payload.isActive ?? true]
        );
        inserted++;
      }
    }

    await logAuditEvent({ actionType: 'pay_range.imported', actorEmail: req.user!.email, targetEntity: 'pay_ranges', targetId: 'import-csv', metadata: { processed, inserted, updated, rejected } });
    res.json({
      success: true,
      data: {
        processed,
        inserted,
        updated,
        rejected,
        validationErrors
      }
    });
  } catch (error) {
    next(error);
  }
});
