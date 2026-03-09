import { Router } from 'express';
import { pool } from '../db.js';

export const recommendationsRouter = Router();

async function getCurrentCycleId(): Promise<number | null> {
  const result = await pool.query('SELECT id FROM merit_cycles ORDER BY id DESC LIMIT 1');
  return result.rows[0]?.id ?? null;
}

recommendationsRouter.get('/', async (_req, res, next) => {
  try {
    const cycleId = await getCurrentCycleId();
    if (!cycleId) {
      res.json({});
      return;
    }

    const result = await pool.query(
      `SELECT employee_id      AS "employeeId",
              merit_pct::float AS "meritPct",
              rating,
              notes,
              status,
              updated_at       AS "updatedAt"
       FROM merit_recommendations
       WHERE cycle_id = $1`,
      [cycleId],
    );

    const map: Record<string, unknown> = {};
    for (const row of result.rows) {
      map[row.employeeId] = {
        meritPct: row.meritPct,
        rating: row.rating,
        notes: row.notes,
        status: row.status,
        updatedAt: row.updatedAt,
      };
    }

    res.json(map);
  } catch (error) {
    next(error);
  }
});

recommendationsRouter.put('/:employeeId', async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { meritPct = 0, rating = 'Meets Expectations', notes = '', status = 'Draft' } = req.body as Record<string, unknown>;

    const cycleId = await getCurrentCycleId();
    if (!cycleId) {
      res.status(400).json({ error: 'No active cycle. Save cycle settings first.' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO merit_recommendations (cycle_id, employee_id, merit_pct, rating, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cycle_id, employee_id)
       DO UPDATE SET merit_pct = EXCLUDED.merit_pct,
                     rating    = EXCLUDED.rating,
                     notes     = EXCLUDED.notes,
                     status    = EXCLUDED.status,
                     updated_at = NOW()
       RETURNING employee_id AS "employeeId",
                 merit_pct::float AS "meritPct",
                 rating, notes, status,
                 updated_at AS "updatedAt"`,
      [cycleId, employeeId, meritPct, rating, notes, status],
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

recommendationsRouter.post('/submit-all', async (_req, res, next) => {
  try {
    const cycleId = await getCurrentCycleId();
    if (!cycleId) {
      res.status(400).json({ error: 'No active cycle. Save cycle settings first.' });
      return;
    }

    const result = await pool.query(
      `UPDATE merit_recommendations
       SET status = 'Submitted', updated_at = NOW()
       WHERE cycle_id = $1 AND status = 'Draft'
       RETURNING employee_id AS "employeeId"`,
      [cycleId],
    );

    res.json({ submitted: result.rows.length });
  } catch (error) {
    next(error);
  }
});
