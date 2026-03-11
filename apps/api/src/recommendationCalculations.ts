import { pool } from './db.js';

export type CycleEligibilityConfig = {
  effectiveDate: string | null;
  minTenureDays: number | null;
  allowEligibilityOverride: boolean | null;
  enableProration: boolean | null;
  prorationStartDate: string | null;
  eligibilityCutoffDate: string | null;
};

function dateFromIso(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function roundTo(value: number, decimals = 2) {
  const p = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * p) / p;
}

export function calculateEligibilityPercent(
  hireDateRaw: string | null,
  cycle: CycleEligibilityConfig
) {
  if (!hireDateRaw) return 1;
  const hireDate = dateFromIso(hireDateRaw);
  if (!hireDate) return 1;

  const asOfDate = cycle.effectiveDate
    ? dateFromIso(cycle.effectiveDate) ?? new Date()
    : new Date();
  const minTenureDays = Number(cycle.minTenureDays ?? 0);
  const tenureDays = Math.floor(
    (asOfDate.getTime() - hireDate.getTime()) / 86400000
  );
  if (tenureDays < minTenureDays) return 0;

  if (!cycle.enableProration) return 1;
  if (!cycle.prorationStartDate || !cycle.eligibilityCutoffDate) return 1;

  const prorationStart = dateFromIso(cycle.prorationStartDate);
  const cutoff = dateFromIso(cycle.eligibilityCutoffDate);
  if (!prorationStart || !cutoff || prorationStart >= cutoff) return 1;

  if (hireDate < prorationStart) return 1;
  if (hireDate >= cutoff) return 0;

  const windowMs = cutoff.getTime() - prorationStart.getTime();
  const eligibleMs = cutoff.getTime() - hireDate.getTime();
  return Math.max(0, Math.min(1, eligibleMs / windowMs));
}

function getEligibleSalaryBase(
  salary: number,
  hireDate: string | null,
  cycle: CycleEligibilityConfig
) {
  const eligibilityPercent = calculateEligibilityPercent(hireDate, cycle);
  const ineligible = eligibilityPercent <= 0;
  return salary * (ineligible && cycle.allowEligibilityOverride ? 1 : eligibilityPercent);
}

export async function recalculateRecommendationAmountsForCycle(cycleId: number) {
  const cycleResult = await pool.query(
    `SELECT effective_date::text AS "effectiveDate",
            min_tenure_days AS "minTenureDays",
            allow_eligibility_override AS "allowEligibilityOverride",
            enable_proration AS "enableProration",
            proration_start_date::text AS "prorationStartDate",
            eligibility_cutoff_date::text AS "eligibilityCutoffDate"
     FROM merit_cycles
     WHERE id = $1`,
    [cycleId]
  );
  const cycle = cycleResult.rows[0] as CycleEligibilityConfig | undefined;
  if (!cycle) return 0;

  const rows = await pool.query(
    `SELECT mr.employee_id AS "employeeId",
            mr.merit_pct::float AS "meritPct",
            mr.bonus_payout_percent::float AS "bonusPayoutPercent",
            e.salary::float AS salary,
            e.hire_date::text AS "hireDate"
     FROM merit_recommendations mr
     INNER JOIN employees e ON e.id = mr.employee_id
     WHERE mr.cycle_id = $1`,
    [cycleId]
  );

  for (const row of rows.rows) {
    const eligibleSalaryBase = getEligibleSalaryBase(row.salary, row.hireDate ?? null, cycle);
    const meritAmount = roundTo(eligibleSalaryBase * ((row.meritPct ?? 0) / 100));
    const bonusPayoutAmount = roundTo(eligibleSalaryBase * ((row.bonusPayoutPercent ?? 0) / 100));
    await pool.query(
      `UPDATE merit_recommendations
       SET merit_amount = $1,
           bonus_payout_amount = $2,
           updated_at = NOW()
       WHERE cycle_id = $3 AND employee_id = $4`,
      [meritAmount, bonusPayoutAmount, cycleId, row.employeeId]
    );
  }

  return rows.rowCount ?? 0;
}

export async function recalculateRecommendationAmountsForEmployee(employeeId: string) {
  const cycleResult = await pool.query(
    `SELECT id
     FROM merit_cycles
     ORDER BY id DESC
     LIMIT 1`
  );
  const cycleId = cycleResult.rows[0]?.id as number | undefined;
  if (!cycleId) return;

  const cycleConfig = await pool.query(
    `SELECT effective_date::text AS "effectiveDate",
            min_tenure_days AS "minTenureDays",
            allow_eligibility_override AS "allowEligibilityOverride",
            enable_proration AS "enableProration",
            proration_start_date::text AS "prorationStartDate",
            eligibility_cutoff_date::text AS "eligibilityCutoffDate"
     FROM merit_cycles
     WHERE id = $1`,
    [cycleId]
  );
  const cycle = cycleConfig.rows[0] as CycleEligibilityConfig | undefined;
  if (!cycle) return;

  const rowResult = await pool.query(
    `SELECT mr.employee_id AS "employeeId",
            mr.merit_pct::float AS "meritPct",
            mr.bonus_payout_percent::float AS "bonusPayoutPercent",
            e.salary::float AS salary,
            e.hire_date::text AS "hireDate"
     FROM merit_recommendations mr
     INNER JOIN employees e ON e.id = mr.employee_id
     WHERE mr.cycle_id = $1 AND mr.employee_id = $2`,
    [cycleId, employeeId]
  );
  const row = rowResult.rows[0];
  if (!row) return;

  const eligibleSalaryBase = getEligibleSalaryBase(row.salary, row.hireDate ?? null, cycle);
  const meritAmount = roundTo(eligibleSalaryBase * ((row.meritPct ?? 0) / 100));
  const bonusPayoutAmount = roundTo(eligibleSalaryBase * ((row.bonusPayoutPercent ?? 0) / 100));
  await pool.query(
    `UPDATE merit_recommendations
     SET merit_amount = $1,
         bonus_payout_amount = $2,
         updated_at = NOW()
     WHERE cycle_id = $3 AND employee_id = $4`,
    [meritAmount, bonusPayoutAmount, cycleId, employeeId]
  );
}
