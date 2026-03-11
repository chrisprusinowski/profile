import { Router } from 'express';
import { getEffectiveManagerScope, requireRole, type AuthenticatedRequest } from '../auth.js';
import { pool } from '../db.js';

export const exportsRouter = Router();

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

async function scopedWhere(req: AuthenticatedRequest) {
  const { managerName: name, managerEmail: email } = getEffectiveManagerScope(req.user!);
  if (req.user!.role !== 'manager') return { clause: '', params: [] as unknown[] };
  return { clause: 'WHERE lower(e.manager)=lower($1) OR lower(e.manager_email)=lower($2)', params: [name, email] };
}

exportsRouter.get('/employees.csv', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive', 'manager'])) return;
  try {
    const sw = await scopedWhere(req);
    const result = await pool.query(`SELECT e.id, e.name, e.email, e.department, e.title, e.salary::float AS salary, e.manager, e.manager_email AS "managerEmail" FROM employees e ${sw.clause} ORDER BY e.name`, sw.params);
    res.type('text/csv').send(csv(result.rows));
  } catch (e) { next(e); }
});

exportsRouter.get('/recommendations.csv', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive', 'manager'])) return;
  try {
    const cycle = await pool.query('SELECT id FROM merit_cycles ORDER BY id DESC LIMIT 1');
    if (!cycle.rows[0]) return res.type('text/csv').send('');
    const sw = await scopedWhere(req);
    const where = sw.clause ? `${sw.clause} AND mr.cycle_id = $3` : 'WHERE mr.cycle_id = $1';
    const params = sw.clause ? [...sw.params, cycle.rows[0].id] : [cycle.rows[0].id];
    const result = await pool.query(
      `SELECT mr.employee_id AS "employeeId", e.name, e.department, mr.merit_pct::float AS "meritPct", mr.merit_amount::float AS "meritAmount", mr.bonus_target_percent::float AS "bonusTargetPercent", mr.bonus_payout_percent::float AS "bonusPayoutPercent", mr.bonus_payout_amount::float AS "bonusPayoutAmount", mr.performance_rating AS "performanceRating", mr.status
       FROM merit_recommendations mr
       JOIN employees e ON e.id = mr.employee_id
       ${where}
       ORDER BY e.name`,
      params
    );
    res.type('text/csv').send(csv(result.rows));
  } catch (e) { next(e); }
});
