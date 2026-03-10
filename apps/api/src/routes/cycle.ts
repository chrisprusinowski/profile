import { Router } from 'express';
import { z } from 'zod';
import { requireRole, type AuthenticatedRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { pool } from '../db.js';

export const cycleRouter = Router();

const cycleSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1),
  type: z.string().trim().default('merit'),
  openDate: z.string().trim().optional().nullable(),
  closeDate: z.string().trim().optional().nullable(),
  effectiveDate: z.string().trim().optional().nullable(),
  totalPayroll: z.coerce.number().min(0).optional().nullable(),
  budgetPct: z.coerce.number().min(0).max(100).optional().nullable(),
  budgetTotal: z.coerce.number().min(0).optional().nullable(),
  guidelineMin: z.coerce.number().min(0).max(100).optional().nullable(),
  guidelineMax: z.coerce.number().min(0).max(100).optional().nullable(),
  status: z.enum(['open', 'closed', 'locked']).default('open')
});

const projection = `id, name, type,
  to_char(open_date, 'YYYY-MM-DD') AS "openDate",
  to_char(close_date, 'YYYY-MM-DD') AS "closeDate",
  to_char(effective_date, 'YYYY-MM-DD') AS "effectiveDate",
  total_payroll::float AS "totalPayroll",
  budget_pct::float AS "budgetPct",
  budget_total::float AS "budgetTotal",
  guideline_min::float AS "guidelineMin",
  guideline_max::float AS "guidelineMax",
  status`;

cycleRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT ${projection} FROM merit_cycles ORDER BY id DESC LIMIT 1`);
    if (!result.rows.length) {
      return res.status(200).json({
        name: 'New Merit Cycle', type: 'merit', openDate: '', closeDate: '', effectiveDate: '', totalPayroll: 0,
        budgetPct: 3.5, budgetTotal: 0, guidelineMin: 0, guidelineMax: 10, status: 'open'
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

cycleRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const parsed = cycleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    const payload = parsed.data;
    if ((payload.guidelineMin ?? 0) > (payload.guidelineMax ?? 10)) {
      return res.status(400).json({ error: 'guidelineMin must be <= guidelineMax' });
    }

    if (payload.id) {
      const before = await pool.query('SELECT * FROM merit_cycles WHERE id = $1', [payload.id]);
      const result = await pool.query(
        `UPDATE merit_cycles
         SET name = $1, type = $2, open_date = NULLIF($3,''), close_date = NULLIF($4,''), effective_date = NULLIF($5,''),
             total_payroll = $6, budget_pct = $7, budget_total = $8, guideline_min = $9, guideline_max = $10, status = $11, updated_at = NOW()
         WHERE id = $12 RETURNING ${projection}`,
        [payload.name, payload.type, payload.openDate ?? '', payload.closeDate ?? '', payload.effectiveDate ?? '', payload.totalPayroll ?? null, payload.budgetPct ?? null, payload.budgetTotal ?? null, payload.guidelineMin ?? 0, payload.guidelineMax ?? 10, payload.status, payload.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: `Cycle ${String(payload.id)} not found` });
      await logAuditEvent({
        actionType: 'cycle.updated', actorEmail: req.user!.email, targetEntity: 'merit_cycles', targetId: String(payload.id), oldValues: before.rows[0] ?? null, newValues: result.rows[0]
      });
      return res.json(result.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO merit_cycles (name, type, open_date, close_date, effective_date, total_payroll, budget_pct, budget_total, guideline_min, guideline_max, status)
       VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), $6, $7, $8, $9, $10, $11)
       RETURNING ${projection}`,
      [payload.name, payload.type, payload.openDate ?? '', payload.closeDate ?? '', payload.effectiveDate ?? '', payload.totalPayroll ?? null, payload.budgetPct ?? null, payload.budgetTotal ?? null, payload.guidelineMin ?? 0, payload.guidelineMax ?? 10, payload.status]
    );
    await logAuditEvent({ actionType: 'cycle.updated', actorEmail: req.user!.email, targetEntity: 'merit_cycles', targetId: String(result.rows[0].id), newValues: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
