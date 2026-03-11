import { Router } from 'express';
import { z } from 'zod';
import { requireRole, type AuthenticatedRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { pool } from '../db.js';

export const cycleRouter = Router();


const twoDecimalNumber = (min: number, max?: number) => {
  const schema = z.coerce.number().finite().min(min);
  const bounded = max == null ? schema : schema.max(max);
  return bounded.refine((value) => Number.isInteger(value * 100), {
    message: 'Must have at most 2 decimal places'
  });
};

function roundTo(value: number, decimals = 2) {
  const p = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * p) / p;
}

const cycleSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1),
  type: z.string().trim().default('merit'),
  openDate: z.string().trim().optional().nullable(),
  closeDate: z.string().trim().optional().nullable(),
  effectiveDate: z.string().trim().optional().nullable(),
  totalPayroll: twoDecimalNumber(0).optional().nullable(),
  budgetPct: twoDecimalNumber(0, 100).optional().nullable(),
  budgetTotal: twoDecimalNumber(0).optional().nullable(),
  guidelineMin: twoDecimalNumber(0, 100).optional().nullable(),
  guidelineMax: twoDecimalNumber(0, 100).optional().nullable(),
  meritBudgetPercent: twoDecimalNumber(0, 100).optional().nullable(),
  bonusBudgetPercent: twoDecimalNumber(0, 100).optional().nullable(),
  guidelineMaxPercent: twoDecimalNumber(0, 100).optional().nullable(),
  minTenureDays: z.coerce.number().int().min(0).optional().nullable(),
  allowEligibilityOverride: z.boolean().optional(),
  enableProration: z.boolean().optional(),
  prorationStartDate: z.string().trim().optional().nullable(),
  eligibilityCutoffDate: z.string().trim().optional().nullable(),
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
  merit_budget_percent::float AS "meritBudgetPercent",
  bonus_budget_percent::float AS "bonusBudgetPercent",
  guideline_max_percent::float AS "guidelineMaxPercent",
  min_tenure_days AS "minTenureDays",
  allow_eligibility_override AS "allowEligibilityOverride",
  enable_proration AS "enableProration",
  to_char(proration_start_date, 'YYYY-MM-DD') AS "prorationStartDate",
  to_char(eligibility_cutoff_date, 'YYYY-MM-DD') AS "eligibilityCutoffDate",
  status`;

function parseDate(input?: string | null): Date | null {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

cycleRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ${projection} FROM merit_cycles ORDER BY id DESC LIMIT 1`
    );
    if (!result.rows.length) {
      return res.status(200).json({
        name: 'New Merit Cycle',
        type: 'merit',
        openDate: '',
        closeDate: '',
        effectiveDate: '',
        totalPayroll: 0,
        budgetPct: 3.5,
        budgetTotal: 0,
        guidelineMin: 0,
        guidelineMax: 10,
        meritBudgetPercent: 3.5,
        bonusBudgetPercent: 10,
        guidelineMaxPercent: 10,
        minTenureDays: 0,
        allowEligibilityOverride: false,
        enableProration: false,
        prorationStartDate: '',
        eligibilityCutoffDate: '',
        status: 'open'
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
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: 'Validation failed', details: parsed.error.flatten() });
    const payload = parsed.data;
    const guidelineMin = roundTo(payload.guidelineMin ?? 0);
    const guidelineMax = roundTo(
      payload.guidelineMaxPercent ?? payload.guidelineMax ?? 10
    );
    const meritBudgetPercent = roundTo(payload.meritBudgetPercent ?? payload.budgetPct ?? 3.5);
    const bonusBudgetPercent = roundTo(payload.bonusBudgetPercent ?? 10);
    const totalPayroll = payload.totalPayroll == null ? null : roundTo(payload.totalPayroll);
    const budgetTotal = payload.budgetTotal == null ? null : roundTo(payload.budgetTotal);

    if (guidelineMin > guidelineMax) {
      return res
        .status(400)
        .json({ error: 'guidelineMin must be <= guidelineMax' });
    }

    const prorationStartDate = payload.prorationStartDate ?? '';
    const eligibilityCutoffDate = payload.eligibilityCutoffDate ?? '';
    const start = parseDate(prorationStartDate);
    const cutoff = parseDate(eligibilityCutoffDate);
    if (prorationStartDate && !start)
      return res
        .status(400)
        .json({ error: 'prorationStartDate must be a valid date' });
    if (eligibilityCutoffDate && !cutoff)
      return res
        .status(400)
        .json({ error: 'eligibilityCutoffDate must be a valid date' });
    if (payload.enableProration && (!start || !cutoff)) {
      return res
        .status(400)
        .json({
          error:
            'prorationStartDate and eligibilityCutoffDate are required when proration is enabled'
        });
    }
    if (start && cutoff && start >= cutoff) {
      return res
        .status(400)
        .json({
          error: 'prorationStartDate must be before eligibilityCutoffDate'
        });
    }

    if (payload.id) {
      const before = await pool.query(
        'SELECT * FROM merit_cycles WHERE id = $1',
        [payload.id]
      );
      const result = await pool.query(
        `UPDATE merit_cycles
         SET name = $1, type = $2, open_date = NULLIF($3,''), close_date = NULLIF($4,''), effective_date = NULLIF($5,''),
             total_payroll = $6, budget_pct = $7, budget_total = $8, guideline_min = $9, guideline_max = $10,
             merit_budget_percent = $11, bonus_budget_percent = $12, guideline_max_percent = $13,
             min_tenure_days = $14, allow_eligibility_override = $15, enable_proration = $16,
             proration_start_date = NULLIF($17,''), eligibility_cutoff_date = NULLIF($18,''),
             status = $19, updated_at = NOW()
         WHERE id = $20 RETURNING ${projection}`,
        [
          payload.name,
          payload.type,
          payload.openDate ?? '',
          payload.closeDate ?? '',
          payload.effectiveDate ?? '',
          totalPayroll,
          meritBudgetPercent,
          budgetTotal,
          guidelineMin,
          guidelineMax,
          meritBudgetPercent,
          bonusBudgetPercent,
          guidelineMax,
          payload.minTenureDays ?? 0,
          payload.allowEligibilityOverride ?? false,
          payload.enableProration ?? false,
          prorationStartDate,
          eligibilityCutoffDate,
          payload.status,
          payload.id
        ]
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ error: `Cycle ${String(payload.id)} not found` });
      await logAuditEvent({
        actionType: 'cycle.updated',
        actorEmail: req.user!.email,
        targetEntity: 'merit_cycles',
        targetId: String(payload.id),
        oldValues: before.rows[0] ?? null,
        newValues: result.rows[0]
      });
      return res.json(result.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO merit_cycles (name, type, open_date, close_date, effective_date, total_payroll, budget_pct, budget_total, guideline_min, guideline_max, merit_budget_percent, bonus_budget_percent, guideline_max_percent, min_tenure_days, allow_eligibility_override, enable_proration, proration_start_date, eligibility_cutoff_date, status)
       VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NULLIF($17,''), NULLIF($18,''), $19)
       RETURNING ${projection}`,
      [
        payload.name,
        payload.type,
        payload.openDate ?? '',
        payload.closeDate ?? '',
        payload.effectiveDate ?? '',
        totalPayroll,
        meritBudgetPercent,
        budgetTotal,
        guidelineMin,
        guidelineMax,
        meritBudgetPercent,
        bonusBudgetPercent,
        guidelineMax,
        payload.minTenureDays ?? 0,
        payload.allowEligibilityOverride ?? false,
        payload.enableProration ?? false,
        prorationStartDate,
        eligibilityCutoffDate,
        payload.status
      ]
    );
    await logAuditEvent({
      actionType: 'cycle.updated',
      actorEmail: req.user!.email,
      targetEntity: 'merit_cycles',
      targetId: String(result.rows[0].id),
      newValues: result.rows[0]
    });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
