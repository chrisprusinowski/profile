import { Router } from 'express';
import { z } from 'zod';
import {
  assertEmployeeInScope,
  getManagerScopeEmail,
  getManagerScopeName,
  requireRole,
  type AuthenticatedRequest
} from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { pool } from '../db.js';

export const recommendationsRouter = Router();

const recommendationPayloadSchema = z.object({
  meritPct: z.coerce.number().finite().min(0).max(25).optional(),
  meritAmount: z.coerce.number().finite().min(0).optional(),
  performanceRating: z.coerce
    .number()
    .int()
    .refine((value) => [1, 2, 3].includes(value), {
      message: 'performanceRating must be 1, 2, or 3'
    })
    .optional(),
  notes: z.string().max(5000).optional(),
  bonusTargetPercent: z.coerce.number().finite().min(0).max(1000).nullable().optional(),
  bonusPayoutPercent: z.coerce.number().finite().min(0).max(1000).optional(),
  bonusPayoutAmount: z.coerce.number().finite().min(0).max(1_000_000_000).optional()
});

async function getCurrentCycle() {
  const result = await pool.query('SELECT id, status FROM merit_cycles ORDER BY id DESC LIMIT 1');
  return result.rows[0] as { id: number; status: string } | undefined;
}

function canEditRecommendation(userRole: 'admin' | 'executive' | 'manager', recStatus: string, cycleStatus: string) {
  if (userRole === 'executive') return false;
  if (userRole === 'admin') return true;
  return cycleStatus === 'open' && recStatus === 'Draft';
}

async function getScopedRecommendations(cycleId: number, req: AuthenticatedRequest) {
  const managerScopeName = getManagerScopeName(req.user!);
  const managerScopeEmail = getManagerScopeEmail(req.user!);
  const result = managerScopeName || managerScopeEmail
    ? await pool.query(
        `SELECT mr.employee_id AS "employeeId",
                mr.merit_pct::float AS "meritPct",
                mr.merit_amount::float AS "meritAmount",
                mr.performance_rating AS "performanceRating",
                mr.bonus_target_percent::float AS "bonusTargetPercent",
                COALESCE(mr.bonus_payout_percent, 0)::float AS "bonusPayoutPercent",
                COALESCE(mr.bonus_payout_amount, 0)::float AS "bonusPayoutAmount",
                mr.notes,
                mr.status,
                mr.updated_at AS "updatedAt",
                mr.updated_by AS "updatedBy",
                mr.submitted_at AS "submittedAt",
                mr.submitted_by AS "submittedBy",
                mr.locked_at AS "lockedAt",
                mr.locked_by AS "lockedBy"
         FROM merit_recommendations mr
         INNER JOIN employees e ON e.id = mr.employee_id
         WHERE mr.cycle_id = $1
           AND (($2::text IS NOT NULL AND lower(e.manager) = lower($2))
             OR ($3::text IS NOT NULL AND lower(e.manager_email) = lower($3)))`,
        [cycleId, managerScopeName, managerScopeEmail]
      )
    : await pool.query(
        `SELECT employee_id AS "employeeId",
                merit_pct::float AS "meritPct",
                merit_amount::float AS "meritAmount",
                performance_rating AS "performanceRating",
                bonus_target_percent::float AS "bonusTargetPercent",
                COALESCE(bonus_payout_percent, 0)::float AS "bonusPayoutPercent",
                COALESCE(bonus_payout_amount, 0)::float AS "bonusPayoutAmount",
                notes,
                status,
                updated_at AS "updatedAt",
                updated_by AS "updatedBy",
                submitted_at AS "submittedAt",
                submitted_by AS "submittedBy",
                locked_at AS "lockedAt",
                locked_by AS "lockedBy"
         FROM merit_recommendations
         WHERE cycle_id = $1`,
        [cycleId]
      );

  const map: Record<string, unknown> = {};
  for (const row of result.rows) map[row.employeeId] = row;
  return map;
}

recommendationsRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const cycle = await getCurrentCycle();
    if (!cycle) return res.json({});
    const map = await getScopedRecommendations(cycle.id, req);
    res.json(map);
  } catch (error) {
    next(error);
  }
});

recommendationsRouter.put('/:employeeId', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'manager'])) return;

  try {
    const employeeId = String(req.params.employeeId);
    const parsed = recommendationPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const inScope = await assertEmployeeInScope(req.user!, employeeId);
    if (!inScope) {
      res.status(403).json({ error: 'forbidden', message: `Employee ${employeeId} is outside your scope` });
      return;
    }

    const cycle = await getCurrentCycle();
    if (!cycle) {
      res.status(400).json({ error: 'No active cycle. Save cycle settings first.' });
      return;
    }

    const employeeResult = await pool.query('SELECT id, salary::float AS salary FROM employees WHERE id = $1', [employeeId]);
    if (!employeeResult.rowCount) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const existing = await pool.query(
      'SELECT * FROM merit_recommendations WHERE cycle_id = $1 AND employee_id = $2',
      [cycle.id, employeeId]
    );
    const currentStatus = existing.rows[0]?.status ?? 'Draft';
    if (!canEditRecommendation(req.user!.role, currentStatus, cycle.status)) {
      res.status(409).json({ error: 'Recommendation is read-only in current workflow state' });
      return;
    }

    const meritPct = parsed.data.meritPct ?? existing.rows[0]?.merit_pct ?? 0;
    const meritAmount = parsed.data.meritAmount ?? Number(employeeResult.rows[0].salary) * (Number(meritPct) / 100);
    const performanceRating = parsed.data.performanceRating ?? existing.rows[0]?.performance_rating ?? 2;
    const notes = parsed.data.notes ?? existing.rows[0]?.notes ?? '';
    const bonusTargetPercent = parsed.data.bonusTargetPercent ?? existing.rows[0]?.bonus_target_percent ?? null;
    const bonusPayoutPercent = parsed.data.bonusPayoutPercent ?? existing.rows[0]?.bonus_payout_percent ?? 0;
    const bonusPayoutAmount = parsed.data.bonusPayoutAmount ?? existing.rows[0]?.bonus_payout_amount ?? 0;

    const result = await pool.query(
      `INSERT INTO merit_recommendations (cycle_id, employee_id, merit_pct, merit_amount, performance_rating, notes, status, bonus_target_percent, bonus_payout_percent, bonus_payout_amount, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'Draft', $7, $8, $9, lower($10))
       ON CONFLICT (cycle_id, employee_id)
       DO UPDATE SET merit_pct = EXCLUDED.merit_pct,
                     merit_amount = EXCLUDED.merit_amount,
                     performance_rating = EXCLUDED.performance_rating,
                     notes = EXCLUDED.notes,
                     bonus_target_percent = EXCLUDED.bonus_target_percent,
                     bonus_payout_percent = EXCLUDED.bonus_payout_percent,
                     bonus_payout_amount = EXCLUDED.bonus_payout_amount,
                     status = 'Draft',
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()
       RETURNING employee_id AS "employeeId", merit_pct::float AS "meritPct", merit_amount::float AS "meritAmount", performance_rating AS "performanceRating", bonus_target_percent::float AS "bonusTargetPercent", bonus_payout_percent::float AS "bonusPayoutPercent", bonus_payout_amount::float AS "bonusPayoutAmount", notes, status, updated_at AS "updatedAt", updated_by AS "updatedBy", submitted_at AS "submittedAt", submitted_by AS "submittedBy", locked_at AS "lockedAt", locked_by AS "lockedBy"`,
      [cycle.id, employeeId, meritPct, meritAmount, performanceRating, notes, bonusTargetPercent, bonusPayoutPercent, bonusPayoutAmount, req.user!.email]
    );

    await logAuditEvent({
      actionType: 'recommendation.updated',
      actorEmail: req.user!.email,
      targetEntity: 'merit_recommendations',
      targetId: `${cycle.id}:${employeeId}`,
      oldValues: existing.rows[0] ?? null,
      newValues: result.rows[0]
    });

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

recommendationsRouter.post('/submit-all', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'manager'])) return;

  try {
    const cycle = await getCurrentCycle();
    if (!cycle) {
      res.status(400).json({ error: 'No active cycle. Save cycle settings first.' });
      return;
    }

    if (req.user!.role === 'manager' && cycle.status !== 'open') {
      res.status(409).json({ error: 'Cycle is not open for manager submissions' });
      return;
    }

    const managerScopeName = getManagerScopeName(req.user!);
    const managerScopeEmail = getManagerScopeEmail(req.user!);
    const result = managerScopeName || managerScopeEmail
      ? await pool.query(
          `UPDATE merit_recommendations mr
           SET status = 'Submitted', submitted_at = NOW(), submitted_by = lower($4), updated_at = NOW(), updated_by = lower($4)
           FROM employees e
           WHERE mr.employee_id = e.id
             AND mr.cycle_id = $1
             AND mr.status = 'Draft'
             AND (($2::text IS NOT NULL AND lower(e.manager) = lower($2))
               OR ($3::text IS NOT NULL AND lower(e.manager_email) = lower($3)))
           RETURNING mr.employee_id AS "employeeId"`,
          [cycle.id, managerScopeName, managerScopeEmail, req.user!.email]
        )
      : await pool.query(
          `UPDATE merit_recommendations
           SET status = 'Submitted', submitted_at = NOW(), submitted_by = lower($2), updated_at = NOW(), updated_by = lower($2)
           WHERE cycle_id = $1 AND status = 'Draft'
           RETURNING employee_id AS "employeeId"`,
          [cycle.id, req.user!.email]
        );

    await logAuditEvent({
      actionType: 'recommendation.submitted',
      actorEmail: req.user!.email,
      targetEntity: 'merit_recommendations',
      targetId: String(cycle.id),
      metadata: { submittedCount: result.rows.length }
    });

    res.json({ submitted: result.rows.length });
  } catch (error) {
    next(error);
  }
});

recommendationsRouter.post('/lock-all', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const cycle = await getCurrentCycle();
    if (!cycle) return res.status(400).json({ error: 'No active cycle.' });

    const result = await pool.query(
      `UPDATE merit_recommendations
       SET status = 'Locked', locked_at = NOW(), locked_by = lower($2), updated_at = NOW(), updated_by = lower($2)
       WHERE cycle_id = $1 AND status IN ('Draft', 'Submitted')
       RETURNING employee_id AS "employeeId"`,
      [cycle.id, req.user!.email]
    );

    await logAuditEvent({
      actionType: 'recommendation.locked',
      actorEmail: req.user!.email,
      targetEntity: 'merit_recommendations',
      targetId: String(cycle.id),
      metadata: { lockedCount: result.rows.length }
    });

    res.json({ locked: result.rows.length });
  } catch (error) {
    next(error);
  }
});

recommendationsRouter.post('/reopen-all', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const cycle = await getCurrentCycle();
    if (!cycle) return res.status(400).json({ error: 'No active cycle.' });

    const result = await pool.query(
      `UPDATE merit_recommendations
       SET status = 'Draft', locked_at = NULL, locked_by = NULL, updated_at = NOW(), updated_by = lower($2)
       WHERE cycle_id = $1 AND status = 'Locked'
       RETURNING employee_id AS "employeeId"`,
      [cycle.id, req.user!.email]
    );

    await logAuditEvent({
      actionType: 'recommendation.reopened',
      actorEmail: req.user!.email,
      targetEntity: 'merit_recommendations',
      targetId: String(cycle.id),
      metadata: { reopenedCount: result.rows.length }
    });

    res.json({ reopened: result.rows.length });
  } catch (error) {
    next(error);
  }
});
