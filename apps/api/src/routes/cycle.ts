import { Router } from 'express';
import { pool } from '../db.js';

export const cycleRouter = Router();

// GET /api/v1/cycle — return the current (most recent) cycle
cycleRouter.get('/', async (_req, res) => {
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
    res.status(404).json({ error: 'No cycle found' });
    return;
  }
  res.json(result.rows[0]);
});

// POST /api/v1/cycle — upsert the current cycle (update if exists, insert if not)
cycleRouter.post('/', async (req, res) => {
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

  if (id) {
    // Update existing cycle
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
    res.json(result.rows[0]);
  } else {
    // Insert new cycle
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
  }
});
