import { Router } from 'express';
import { requireRole, type AuthenticatedRequest } from '../auth.js';
import { pool } from '../db.js';

export const cycleRouter = Router();

cycleRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, type,
              to_char(open_date, 'YYYY-MM-DD')      AS "openDate",
              to_char(close_date, 'YYYY-MM-DD')     AS "closeDate",
              to_char(effective_date, 'YYYY-MM-DD') AS "effectiveDate",
              total_payroll::float                  AS "totalPayroll",
              budget_pct::float                     AS "budgetPct",
              budget_total::float                   AS "budgetTotal",
              guideline_min::float                  AS "guidelineMin",
              guideline_max::float                  AS "guidelineMax",
              status
       FROM merit_cycles
       ORDER BY id DESC
       LIMIT 1`,
    );

    if (result.rows.length === 0) {
      res.status(200).json({
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
        status: 'open',
      });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

cycleRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const {
      name,
      type = 'merit',
      openDate,
      closeDate,
      effectiveDate,
      totalPayroll,
      budgetPct,
      budgetTotal,
      guidelineMin = 0,
      guidelineMax = 10,
      status = 'open',
      id,
    } = req.body as Record<string, unknown>;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Cycle name is required' });
      return;
    }

    if (id) {
      const result = await pool.query(
        `UPDATE merit_cycles
         SET name = $1, type = $2, open_date = $3, close_date = $4, effective_date = $5,
             total_payroll = $6, budget_pct = $7, budget_total = $8,
             guideline_min = $9, guideline_max = $10, status = $11, updated_at = NOW()
         WHERE id = $12
         RETURNING id, name, type,
                   to_char(open_date, 'YYYY-MM-DD')      AS "openDate",
                   to_char(close_date, 'YYYY-MM-DD')     AS "closeDate",
                   to_char(effective_date, 'YYYY-MM-DD') AS "effectiveDate",
                   total_payroll::float                  AS "totalPayroll",
                   budget_pct::float                     AS "budgetPct",
                   budget_total::float                   AS "budgetTotal",
                   guideline_min::float                  AS "guidelineMin",
                   guideline_max::float                  AS "guidelineMax",
                   status`,
        [name, type, openDate, closeDate, effectiveDate, totalPayroll, budgetPct, budgetTotal, guidelineMin, guidelineMax, status, id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: `Cycle ${String(id)} not found` });
        return;
      }

      res.json(result.rows[0]);
      return;
    }

    const result = await pool.query(
      `INSERT INTO merit_cycles (name, type, open_date, close_date, effective_date,
                                  total_payroll, budget_pct, budget_total, guideline_min, guideline_max, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, name, type,
                 to_char(open_date, 'YYYY-MM-DD')      AS "openDate",
                 to_char(close_date, 'YYYY-MM-DD')     AS "closeDate",
                 to_char(effective_date, 'YYYY-MM-DD') AS "effectiveDate",
                 total_payroll::float                  AS "totalPayroll",
                 budget_pct::float                     AS "budgetPct",
                 budget_total::float                   AS "budgetTotal",
                 guideline_min::float                  AS "guidelineMin",
                 guideline_max::float                  AS "guidelineMax",
                 status`,
      [name, type, openDate, closeDate, effectiveDate, totalPayroll, budgetPct, budgetTotal, guidelineMin, guidelineMax, status],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
