import { Router } from 'express';
import { z } from 'zod';
import {
  assertEmployeeInScope,
  getManagerScopeName,
  requireRole,
  type AuthenticatedRequest
} from '../auth.js';
import { pool } from '../db.js';

export const recommendationsRouter = Router();

const recommendationPayloadSchema = z.object({
  meritPct: z.coerce.number().finite().min(0).max(25).optional(),
  performanceRating: z.coerce
    .number()
    .int()
    .refine((value) => [1, 2, 3].includes(value), {
      message: 'performanceRating must be 1, 2, or 3'
    })
    .optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['Draft', 'Submitted', 'Approved', 'Flagged']).optional(),
  bonusTargetPercent: z.coerce
    .number()
    .finite()
    .min(0)
    .max(1000)
    .nullable()
    .optional(),
  bonusPayoutPercent: z.coerce.number().finite().min(0).max(1000).optional(),
  bonusPayoutAmount: z.coerce
    .number()
    .finite()
    .min(0)
    .max(1_000_000_000)
    .optional()
});

async function getCurrentCycleId(): Promise<number | null> {
  const result = await pool.query(
    'SELECT id FROM merit_cycles ORDER BY id DESC LIMIT 1'
  );
  return result.rows[0]?.id ?? null;
}

recommendationsRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const cycleId = await getCurrentCycleId();
    if (!cycleId) {
      res.json({});
      return;
    }

    const managerScopeName = getManagerScopeName(req.user!);
    const result = managerScopeName
      ? await pool.query(
          `SELECT mr.employee_id                      AS "employeeId",
                mr.merit_pct::float                 AS "meritPct",
                mr.performance_rating               AS "performanceRating",
                mr.bonus_target_percent::float      AS "bonusTargetPercent",
                COALESCE(mr.bonus_payout_percent, 0)::float AS "bonusPayoutPercent",
                COALESCE(mr.bonus_payout_amount, 0)::float  AS "bonusPayoutAmount",
                mr.notes,
                mr.status,
                mr.updated_at                       AS "updatedAt"
         FROM merit_recommendations mr
         INNER JOIN employees e ON e.id = mr.employee_id
         WHERE mr.cycle_id = $1
           AND lower(e.manager) = lower($2)`,
          [cycleId, managerScopeName]
        )
      : await pool.query(
          `SELECT employee_id                         AS "employeeId",
                merit_pct::float                    AS "meritPct",
                performance_rating                  AS "performanceRating",
                bonus_target_percent::float         AS "bonusTargetPercent",
                COALESCE(bonus_payout_percent, 0)::float AS "bonusPayoutPercent",
                COALESCE(bonus_payout_amount, 0)::float  AS "bonusPayoutAmount",
                notes,
                status,
                updated_at                          AS "updatedAt"
         FROM merit_recommendations
         WHERE cycle_id = $1`,
          [cycleId]
        );

    const map: Record<string, unknown> = {};
    for (const row of result.rows) {
      map[row.employeeId] = {
        meritPct: row.meritPct,
        performanceRating: row.performanceRating,
        bonusTargetPercent: row.bonusTargetPercent,
        bonusPayoutPercent: row.bonusPayoutPercent,
        bonusPayoutAmount: row.bonusPayoutAmount,
        notes: row.notes,
        status: row.status,
        updatedAt: row.updatedAt
      };
    }

    res.json(map);
  } catch (error) {
    next(error);
  }
});

recommendationsRouter.put(
  '/:employeeId',
  async (req: AuthenticatedRequest, res, next) => {
    if (!requireRole(req, res, ['admin', 'manager'])) return;

    try {
      const employeeId = String(req.params.employeeId);
      const parsed = recommendationPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({
            error: 'Validation failed',
            details: parsed.error.flatten()
          });
        return;
      }

      const {
        meritPct = 0,
        performanceRating = 2,
        notes = '',
        status = 'Draft',
        bonusTargetPercent = null,
        bonusPayoutPercent = 0,
        bonusPayoutAmount = 0
      } = parsed.data;

      const inScope = await assertEmployeeInScope(req.user!, employeeId);
      if (!inScope) {
        res
          .status(403)
          .json({
            error: 'forbidden',
            message: `Employee ${employeeId} is outside your scope`
          });
        return;
      }

      const cycleId = await getCurrentCycleId();
      if (!cycleId) {
        res
          .status(400)
          .json({ error: 'No active cycle. Save cycle settings first.' });
        return;
      }

      const employeeCheck = await pool.query(
        'SELECT 1 FROM employees WHERE id = $1',
        [employeeId]
      );
      if (employeeCheck.rowCount === 0) {
        res.status(404).json({ error: 'Employee not found' });
        return;
      }

      const result = await pool.query(
        `INSERT INTO merit_recommendations (
         cycle_id,
         employee_id,
         merit_pct,
         performance_rating,
         notes,
         status,
         bonus_target_percent,
         bonus_payout_percent,
         bonus_payout_amount
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (cycle_id, employee_id)
       DO UPDATE SET merit_pct = EXCLUDED.merit_pct,
                     performance_rating = EXCLUDED.performance_rating,
                     notes = EXCLUDED.notes,
                     status = EXCLUDED.status,
                     bonus_target_percent = EXCLUDED.bonus_target_percent,
                     bonus_payout_percent = EXCLUDED.bonus_payout_percent,
                     bonus_payout_amount = EXCLUDED.bonus_payout_amount,
                     updated_at = NOW()
       RETURNING employee_id AS "employeeId",
                 merit_pct::float AS "meritPct",
                 performance_rating AS "performanceRating",
                 bonus_target_percent::float AS "bonusTargetPercent",
                 bonus_payout_percent::float AS "bonusPayoutPercent",
                 bonus_payout_amount::float AS "bonusPayoutAmount",
                 notes,
                 status,
                 updated_at AS "updatedAt"`,
        [
          cycleId,
          employeeId,
          meritPct,
          performanceRating,
          notes,
          status,
          bonusTargetPercent,
          bonusPayoutPercent,
          bonusPayoutAmount
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

recommendationsRouter.post(
  '/submit-all',
  async (req: AuthenticatedRequest, res, next) => {
    if (!requireRole(req, res, ['admin', 'manager'])) return;

    try {
      const cycleId = await getCurrentCycleId();
      if (!cycleId) {
        res
          .status(400)
          .json({ error: 'No active cycle. Save cycle settings first.' });
        return;
      }

      const managerScopeName = getManagerScopeName(req.user!);
      const result = managerScopeName
        ? await pool.query(
            `UPDATE merit_recommendations mr
         SET status = 'Submitted', updated_at = NOW()
         FROM employees e
         WHERE mr.employee_id = e.id
           AND mr.cycle_id = $1
           AND mr.status = 'Draft'
           AND lower(e.manager) = lower($2)
         RETURNING mr.employee_id AS "employeeId"`,
            [cycleId, managerScopeName]
          )
        : await pool.query(
            `UPDATE merit_recommendations
         SET status = 'Submitted', updated_at = NOW()
         WHERE cycle_id = $1 AND status = 'Draft'
         RETURNING employee_id AS "employeeId"`,
            [cycleId]
          );

      res.json({ submitted: result.rows.length });
    } catch (error) {
      next(error);
    }
  }
);
