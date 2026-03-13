import { Router } from 'express';
import { z } from 'zod';
import {
  assertEmployeeInScope,
  getEffectiveExecutiveScope,
  requireRole,
  type AppRole,
  type AppUser,
  type AuthenticatedRequest
} from '../auth.js';
import { pool } from '../db.js';
import { calculateCompensationOutputs } from '../compensationCalculations.js';
export const compensationCyclesRouter = Router();
const nullableNumber = z.coerce.number().finite().optional().nullable();
const cycleSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1),
  status: z.string().trim().optional().nullable(),
  cycleType: z.string().trim().optional().nullable(),
  openDate: z.string().trim().optional().nullable(),
  closeDate: z.string().trim().optional().nullable(),
  effectiveDate: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable()
});
const planSchema = z.object({
  priorPerformanceRating: z.string().optional().nullable(),
  currentPerformanceRating: z.string().optional().nullable(),
  meritIncreaseAmount: nullableNumber,
  meritIncreasePercent: nullableNumber,
  recommendedMeritAmount: nullableNumber,
  recommendedMeritPercent: nullableNumber,
  varianceFromRecommendation: nullableNumber,
  isPromotion: z.boolean().optional().nullable(),
  promotionType: z.string().optional().nullable(),
  newJobTitle: z.string().optional().nullable(),
  promotionRationale: z.string().optional().nullable(),
  promotionIncreaseAmount: nullableNumber,
  bonusOverrideAmount: nullableNumber,
  bonusOverridePercent: nullableNumber,
  bonusWeightCompany: nullableNumber,
  bonusWeightIndividual: nullableNumber,
  goalAttainmentCompany: nullableNumber,
  goalAttainmentIndividual: nullableNumber,
  execReview: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  plannerInputs: z.record(z.any()).optional().nullable()
});

const plannerStatusValues = ['not_started', 'in_progress', 'manager_submitted', 'exec_reviewed', 'finalized'] as const;

const plannerStatusSchema = z.enum(plannerStatusValues);

const EXPORT_SCHEMA_VERSION = '2026.05';

const editableFieldsByStatus: Record<(typeof plannerStatusValues)[number], Array<keyof EmployeeEditablePatch>> = {
  not_started: ['currentPerformanceRating', 'meritIncreasePercent', 'goalAttainmentCompany', 'goalAttainmentIndividual', 'isPromotion', 'notes'],
  in_progress: ['currentPerformanceRating', 'meritIncreasePercent', 'goalAttainmentCompany', 'goalAttainmentIndividual', 'isPromotion', 'notes'],
  manager_submitted: ['execReview', 'notes'],
  exec_reviewed: ['execReview', 'notes'],
  finalized: []
};

type EmployeeEditablePatch = Pick<z.infer<typeof planSchema>, 'currentPerformanceRating' | 'meritIncreasePercent' | 'goalAttainmentCompany' | 'goalAttainmentIndividual' | 'isPromotion' | 'notes' | 'execReview'>;

const statusTransitions: Record<(typeof plannerStatusValues)[number], Array<(typeof plannerStatusValues)[number]>> = {
  not_started: ['in_progress'],
  in_progress: ['manager_submitted', 'not_started'],
  manager_submitted: ['in_progress', 'exec_reviewed'],
  exec_reviewed: ['manager_submitted', 'finalized'],
  finalized: ['exec_reviewed']
};

function parseBooleanQuery(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value === '1' || value.toLowerCase() === 'true';
}

function createFilterClauses(filters: {
  search?: string;
  department?: string;
  promotionOnly?: boolean;
}, startingParamIndex = 1) {
  const clauses = ['1=1'];
  const values: Array<string | number | boolean> = [];

  if (filters.search?.trim()) {
    values.push(`%${filters.search.trim().toLowerCase()}%`);
    clauses.push(`(lower(e.id) LIKE $${startingParamIndex + values.length - 1} OR lower(COALESCE(e.full_name, '')) LIKE $${startingParamIndex + values.length - 1})`);
  }
  if (filters.department?.trim()) {
    values.push(filters.department.trim());
    clauses.push(`e.department = $${startingParamIndex + values.length - 1}`);
  }
  if (filters.promotionOnly) {
    clauses.push(`COALESCE(p.is_promotion, false) = true`);
  }

  return { clauses, values };
}

function buildExecutiveScopeWhere(
  user: AppUser | undefined,
  options?: {
    employeeAlias?: string;
    includeLeadingAnd?: boolean;
    startingParamIndex?: number;
  }
): { clause: string; values: string[] } {
  if (user?.role !== 'executive') {
    return { clause: '', values: [] };
  }
  const employeeAlias = options?.employeeAlias ?? 'e';
  const includeLeadingAnd = options?.includeLeadingAnd ?? true;
  const startingParamIndex = options?.startingParamIndex ?? 1;
  const { executiveEmail } = getEffectiveExecutiveScope(user);

  const values: string[] = [];
  const predicates: string[] = [];
  if (executiveEmail) {
    values.push(executiveEmail);
    predicates.push(`lower(${employeeAlias}.executive_email) = lower($${startingParamIndex + values.length - 1})`);
  }

  if (predicates.length === 0) {
    return { clause: includeLeadingAnd ? ' AND 1=0' : '1=0', values: [] };
  }

  const prefix = includeLeadingAnd ? ' AND ' : '';
  return { clause: `${prefix}(${predicates.join(' OR ')})`, values };
}

async function getCurrentPlanningStatus(cycleId: number, employeeId: string) {
  const current = await pool.query(
    `SELECT planning_status AS "planningStatus"
     FROM employee_cycle_plans
     WHERE cycle_id = $1 AND employee_id = $2`,
    [cycleId, employeeId]
  );
  return (current.rows[0]?.planningStatus ?? 'not_started') as (typeof plannerStatusValues)[number];
}

function hasAdminOverride(role: AppRole | undefined, overrideFlag: unknown): boolean {
  return role === 'admin' && overrideFlag === true;
}

function validateEditableFields(
  role: AppRole | undefined,
  planningStatus: (typeof plannerStatusValues)[number],
  patch: z.infer<typeof planSchema>,
  adminOverride: boolean
): string[] {
  if (adminOverride && role === 'admin') return [];
  const allowed = new Set(editableFieldsByStatus[planningStatus]);
  if (role === 'executive') {
    allowed.clear();
    allowed.add('execReview');
    allowed.add('notes');
  }
  if (role === 'admin') {
    editableFieldsByStatus[planningStatus].forEach((f) => allowed.add(f));
    allowed.add('execReview');
  }
  const changedKeys = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  return changedKeys.filter((k) => !allowed.has(k as keyof EmployeeEditablePatch));
}

const bulkPlanSchema = z.object({
  employeeIds: z.array(z.string()).optional(),
  filters: z.object({
    department: z.string().optional(),
    executiveEmail: z.string().optional(),
    location: z.string().optional(),
    businessEntity: z.string().optional(),
    promotionOnly: z.boolean().optional(),
    missingDataOnly: z.boolean().optional()
  }).optional(),
  updates: planSchema.pick({
    meritIncreasePercent: true,
    currentPerformanceRating: true,
    goalAttainmentCompany: true,
    goalAttainmentIndividual: true,
    isPromotion: true
  }).refine((value) => Object.values(value).some((v) => v !== undefined), { message: 'At least one update field is required' })
});


type PlanRecord = {
  priorPerformanceRating: string | null;
  currentPerformanceRating: string | null;
  meritIncreaseAmount: number | null;
  meritIncreasePercent: number | null;
  recommendedMeritAmount: number | null;
  recommendedMeritPercent: number | null;
  varianceFromRecommendation: number | null;
  isPromotion: boolean | null;
  promotionType: string | null;
  newJobTitle: string | null;
  promotionRationale: string | null;
  promotionIncreaseAmount: number | null;
  bonusOverrideAmount: number | null;
  bonusOverridePercent: number | null;
  bonusWeightCompany: number | null;
  bonusWeightIndividual: number | null;
  goalAttainmentCompany: number | null;
  goalAttainmentIndividual: number | null;
  execReview: string | null;
  notes: string | null;
  planningStatus: string | null;
};

const trackedPlanFields: Array<keyof PlanRecord> = [
  'priorPerformanceRating',
  'currentPerformanceRating',
  'meritIncreaseAmount',
  'meritIncreasePercent',
  'recommendedMeritAmount',
  'recommendedMeritPercent',
  'varianceFromRecommendation',
  'isPromotion',
  'promotionType',
  'newJobTitle',
  'promotionRationale',
  'promotionIncreaseAmount',
  'bonusOverrideAmount',
  'bonusOverridePercent',
  'bonusWeightCompany',
  'bonusWeightIndividual',
  'goalAttainmentCompany',
  'goalAttainmentIndividual',
  'execReview',
  'notes',
  'planningStatus'
];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function writePlanAudit(
  cycleId: number,
  employeeId: string,
  oldPlan: Partial<PlanRecord>,
  newPlan: Partial<PlanRecord>,
  changedBy: string
): Promise<void> {
  for (const field of trackedPlanFields) {
    const oldValue = oldPlan[field] ?? null;
    const newValue = newPlan[field] ?? null;
    if (sameValue(oldValue, newValue)) continue;
    await pool.query(
      `INSERT INTO planner_change_audit (
        cycle_id, employee_id, field_name, old_value, new_value, changed_by
      ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [cycleId, employeeId, field, JSON.stringify(oldValue), JSON.stringify(newValue), changedBy]
    );
  }
}
function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
const TOTAL_SUMMARY_COLUMNS = [
  'employeeId',
  'importBatchId',
  'importedFirstName',
  'importedLastName',
  'importedFullName',
  'importedDepartment',
  'importedTitle',
  'importedSalary',
  'importedRawAttributes',
  'enteredCurrentPerformanceRating',
  'enteredPriorPerformanceRating',
  'enteredMeritIncreaseAmount',
  'enteredMeritIncreasePercent',
  'enteredRecommendedMeritAmount',
  'enteredRecommendedMeritPercent',
  'enteredVarianceFromRecommendation',
  'enteredIsPromotion',
  'enteredPromotionType',
  'enteredNewJobTitle',
  'enteredPromotionRationale',
  'enteredPromotionIncreaseAmount',
  'enteredBonusOverrideAmount',
  'enteredBonusOverridePercent',
  'enteredBonusWeightCompany',
  'enteredBonusWeightIndividual',
  'enteredGoalAttainmentCompany',
  'enteredGoalAttainmentIndividual',
  'enteredExecReview',
  'enteredNotes',
  'enteredPlanningStatus',
  'enteredPlannerInputs',
  'derivedCompaRatio',
  'derivedSalaryAfterMerit',
  'derivedFinalSalaryWithPromo',
  'derivedCurrentBonusTargetAmount',
  'derivedFinalCompanyBonusProrated',
  'derivedFinalIndividualBonusProrated',
  'derivedFinalTotalBonusProrated',
  'derivedNewRangeCompaRatio',
  'derivedVarianceFromRecommendation',
  'derivedGapFlags',
  'derivedMissingDataReasons',
  'derivedGeneratedAt'
] as const;
const cycleProjection = `id, name, status, cycle_type AS "cycleType",
  to_char(open_date, 'YYYY-MM-DD') AS "openDate",
  to_char(close_date, 'YYYY-MM-DD') AS "closeDate",
  to_char(effective_date, 'YYYY-MM-DD') AS "effectiveDate",
  notes, metadata, created_at AS "createdAt", updated_at AS "updatedAt"`;
async function regenerateOutputsForCycle(cycleId: number): Promise<number> {
  const rows = await pool.query(
    `SELECT e.id AS "employeeId",
            e.salary::float AS salary,
            e.range_mid::float AS "rangeMid",
            e.bonus_target_percent::float AS "bonusTargetPercent",
            p.merit_increase_amount::float AS "meritIncreaseAmount",
            p.merit_increase_percent::float AS "meritIncreasePercent",
            p.recommended_merit_amount::float AS "recommendedMeritAmount",
            p.recommended_merit_percent::float AS "recommendedMeritPercent",
            p.promotion_increase_amount::float AS "promotionIncreaseAmount",
            p.bonus_override_amount::float AS "bonusOverrideAmount",
            p.bonus_override_percent::float AS "bonusOverridePercent",
            p.bonus_weight_company::float AS "bonusWeightCompany",
            p.bonus_weight_individual::float AS "bonusWeightIndividual",
            p.goal_attainment_company::float AS "goalAttainmentCompany",
            p.goal_attainment_individual::float AS "goalAttainmentIndividual",
            p.variance_from_recommendation::float AS "plannerVariance",
            COALESCE(NULLIF(p.new_job_title, ''), e.title) AS "plannedTitle",
            COALESCE(pr.mid::float, e.range_mid::float) AS "newRangeMid"
     FROM employees e
     LEFT JOIN employee_cycle_plans p
       ON p.employee_id = e.id AND p.cycle_id = $1
     LEFT JOIN pay_ranges pr
       ON pr.title = COALESCE(NULLIF(p.new_job_title, ''), e.title)
     ORDER BY e.id`,
    [cycleId]
  );
  for (const row of rows.rows) {
    const output = calculateCompensationOutputs({
      salary: row.salary ?? null,
      rangeMid: row.rangeMid ?? null,
      newRangeMid: row.newRangeMid ?? null,
      bonusTargetPercent: row.bonusTargetPercent ?? null,
      meritIncreaseAmount: row.meritIncreaseAmount ?? null,
      meritIncreasePercent: row.meritIncreasePercent ?? null,
      recommendedMeritAmount: row.recommendedMeritAmount ?? null,
      recommendedMeritPercent: row.recommendedMeritPercent ?? null,
      promotionIncreaseAmount: row.promotionIncreaseAmount ?? null,
      bonusOverrideAmount: row.bonusOverrideAmount ?? null,
      bonusOverridePercent: row.bonusOverridePercent ?? null,
      bonusWeightCompany: row.bonusWeightCompany ?? null,
      bonusWeightIndividual: row.bonusWeightIndividual ?? null,
      goalAttainmentCompany: row.goalAttainmentCompany ?? null,
      goalAttainmentIndividual: row.goalAttainmentIndividual ?? null
    });
    const variance = row.plannerVariance ?? output.varianceFromRecommendation;
    await pool.query(
      `INSERT INTO employee_comp_outputs (
        cycle_id, employee_id, compa_ratio, salary_after_merit, final_salary_with_promo,
        current_bonus_target_amount, final_company_bonus_prorated, final_individual_bonus_prorated,
        final_total_bonus_prorated, new_range_compa_ratio, variance_from_recommendation,
        gap_flags, missing_data_reasons, generated_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12::jsonb, $13::jsonb, NOW(), NOW()
      )
      ON CONFLICT (cycle_id, employee_id)
      DO UPDATE SET
        compa_ratio = EXCLUDED.compa_ratio,
        salary_after_merit = EXCLUDED.salary_after_merit,
        final_salary_with_promo = EXCLUDED.final_salary_with_promo,
        current_bonus_target_amount = EXCLUDED.current_bonus_target_amount,
        final_company_bonus_prorated = EXCLUDED.final_company_bonus_prorated,
        final_individual_bonus_prorated = EXCLUDED.final_individual_bonus_prorated,
        final_total_bonus_prorated = EXCLUDED.final_total_bonus_prorated,
        new_range_compa_ratio = EXCLUDED.new_range_compa_ratio,
        variance_from_recommendation = EXCLUDED.variance_from_recommendation,
        gap_flags = EXCLUDED.gap_flags,
        missing_data_reasons = EXCLUDED.missing_data_reasons,
        generated_at = NOW(),
        updated_at = NOW()`,
      [
        cycleId,
        row.employeeId,
        output.compaRatio,
        output.salaryAfterMerit,
        output.finalSalaryWithPromo,
        output.currentBonusTargetAmount,
        output.finalCompanyBonusProrated,
        output.finalIndividualBonusProrated,
        output.finalTotalBonusProrated,
        output.newRangeCompaRatio,
        variance,
        JSON.stringify(output.gapFlags),
        JSON.stringify(output.missingDataReasons)
      ]
    );
  }
  return rows.rowCount ?? 0;
}

async function fetchTotalSummaryRows(
  cycleId: number,
  user?: AppUser,
  filters?: {
    search?: string;
    department?: string;
    promotionOnly?: boolean;
  }
) {
  const built = createFilterClauses(filters ?? {}, 2);
  const executiveScope = buildExecutiveScopeWhere(user, {
    employeeAlias: 'e',
    includeLeadingAnd: true,
    startingParamIndex: built.values.length + 2
  });
  const values: Array<string | number | boolean> = [cycleId, ...built.values, ...executiveScope.values];
  const sql = `SELECT e.id AS "employeeId",
              e.import_batch_id AS "importBatchId",
              e.first_name AS "importedFirstName",
              e.last_name AS "importedLastName",
              e.full_name AS "importedFullName",
              e.department AS "importedDepartment",
              e.title AS "importedTitle",
              e.salary::float AS "importedSalary",
              e.raw_attributes AS "importedRawAttributes",
              p.current_performance_rating AS "enteredCurrentPerformanceRating",
              p.prior_performance_rating AS "enteredPriorPerformanceRating",
              p.merit_increase_amount::float AS "enteredMeritIncreaseAmount",
              p.merit_increase_percent::float AS "enteredMeritIncreasePercent",
              p.recommended_merit_amount::float AS "enteredRecommendedMeritAmount",
              p.recommended_merit_percent::float AS "enteredRecommendedMeritPercent",
              p.variance_from_recommendation::float AS "enteredVarianceFromRecommendation",
              p.is_promotion AS "enteredIsPromotion",
              p.promotion_type AS "enteredPromotionType",
              p.new_job_title AS "enteredNewJobTitle",
              p.promotion_rationale AS "enteredPromotionRationale",
              p.promotion_increase_amount::float AS "enteredPromotionIncreaseAmount",
              p.bonus_override_amount::float AS "enteredBonusOverrideAmount",
              p.bonus_override_percent::float AS "enteredBonusOverridePercent",
              p.bonus_weight_company::float AS "enteredBonusWeightCompany",
              p.bonus_weight_individual::float AS "enteredBonusWeightIndividual",
              p.goal_attainment_company::float AS "enteredGoalAttainmentCompany",
              p.goal_attainment_individual::float AS "enteredGoalAttainmentIndividual",
              p.exec_review AS "enteredExecReview",
              p.notes AS "enteredNotes",
              p.planning_status AS "enteredPlanningStatus",
              p.planner_inputs AS "enteredPlannerInputs",
              o.compa_ratio::float AS "derivedCompaRatio",
              o.salary_after_merit::float AS "derivedSalaryAfterMerit",
              o.final_salary_with_promo::float AS "derivedFinalSalaryWithPromo",
              o.current_bonus_target_amount::float AS "derivedCurrentBonusTargetAmount",
              o.final_company_bonus_prorated::float AS "derivedFinalCompanyBonusProrated",
              o.final_individual_bonus_prorated::float AS "derivedFinalIndividualBonusProrated",
              o.final_total_bonus_prorated::float AS "derivedFinalTotalBonusProrated",
              o.new_range_compa_ratio::float AS "derivedNewRangeCompaRatio",
              o.variance_from_recommendation::float AS "derivedVarianceFromRecommendation",
              o.gap_flags AS "derivedGapFlags",
              o.missing_data_reasons AS "derivedMissingDataReasons",
              o.generated_at AS "derivedGeneratedAt"
       FROM employees e
       LEFT JOIN employee_cycle_plans p
         ON p.employee_id = e.id AND p.cycle_id = $1
       LEFT JOIN employee_comp_outputs o
         ON o.employee_id = e.id AND o.cycle_id = $1
       WHERE ${built.clauses.join(' AND ')}${executiveScope.clause}
       ORDER BY e.id`;
  const result = await pool.query(sql, values);
  return result.rows;
}

compensationCyclesRouter.get('/cycles', async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT ${cycleProjection} FROM compensation_cycles ORDER BY id DESC`);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
compensationCyclesRouter.post('/cycles', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const parsed = cycleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const payload = parsed.data;
    const metadata = payload.metadata ?? {};
    if (payload.id) {
      const updated = await pool.query(
        `UPDATE compensation_cycles
         SET name = $1,
             status = $2,
             cycle_type = $3,
             open_date = NULLIF($4, '')::date,
             close_date = NULLIF($5, '')::date,
             effective_date = NULLIF($6, '')::date,
             notes = $7,
             metadata = $8::jsonb,
             updated_at = NOW()
         WHERE id = $9
         RETURNING ${cycleProjection}`,
        [
          payload.name,
          payload.status ?? null,
          payload.cycleType ?? null,
          payload.openDate ?? null,
          payload.closeDate ?? null,
          payload.effectiveDate ?? null,
          payload.notes ?? null,
          JSON.stringify(metadata),
          payload.id
        ]
      );
      return res.json({ data: updated.rows[0] ?? null });
    }
    const inserted = await pool.query(
      `INSERT INTO compensation_cycles (
        name, status, cycle_type, open_date, close_date, effective_date, notes, metadata
      ) VALUES (
        $1, $2, $3, NULLIF($4, '')::date, NULLIF($5, '')::date, NULLIF($6, '')::date, $7, $8::jsonb
      ) RETURNING ${cycleProjection}`,
      [
        payload.name,
        payload.status ?? null,
        payload.cycleType ?? null,
        payload.openDate ?? null,
        payload.closeDate ?? null,
        payload.effectiveDate ?? null,
        payload.notes ?? null,
        JSON.stringify(metadata)
      ]
    );
    res.status(201).json({ data: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});
compensationCyclesRouter.get('/cycles/:cycleId/plans', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    const executiveScope = buildExecutiveScopeWhere(req.user, { employeeAlias: 'e', startingParamIndex: 2 });
    const values: Array<string | number> = [cycleId, ...executiveScope.values];
    const result = await pool.query(
      `SELECT e.id AS "employeeId",
              e.name,
              e.salary::float AS salary,
              e.raw_attributes AS "importedRawAttributes",
              p.id AS "planId",
              p.prior_performance_rating AS "priorPerformanceRating",
              p.current_performance_rating AS "currentPerformanceRating",
              p.merit_increase_amount::float AS "meritIncreaseAmount",
              p.merit_increase_percent::float AS "meritIncreasePercent",
              p.recommended_merit_amount::float AS "recommendedMeritAmount",
              p.recommended_merit_percent::float AS "recommendedMeritPercent",
              p.variance_from_recommendation::float AS "varianceFromRecommendation",
              p.is_promotion AS "isPromotion",
              p.promotion_type AS "promotionType",
              p.new_job_title AS "newJobTitle",
              p.promotion_rationale AS "promotionRationale",
              p.promotion_increase_amount::float AS "promotionIncreaseAmount",
              p.bonus_override_amount::float AS "bonusOverrideAmount",
              p.bonus_override_percent::float AS "bonusOverridePercent",
              p.bonus_weight_company::float AS "bonusWeightCompany",
              p.bonus_weight_individual::float AS "bonusWeightIndividual",
              p.goal_attainment_company::float AS "goalAttainmentCompany",
              p.goal_attainment_individual::float AS "goalAttainmentIndividual",
              p.exec_review AS "execReview",
              p.notes,
              p.planning_status AS "planningStatus",
              p.planner_inputs AS "plannerInputs"
       FROM employees e
       LEFT JOIN employee_cycle_plans p
         ON p.employee_id = e.id AND p.cycle_id = $1
       WHERE 1=1${executiveScope.clause}
       ORDER BY e.id`,
      values
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
compensationCyclesRouter.put('/cycles/:cycleId/plans/:employeeId', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    const employeeId = String(req.params.employeeId);
    if (!(await assertEmployeeInScope(req.user!, employeeId))) {
      return res.status(404).json({ error: 'not_found', message: `Employee ${employeeId} not found in scope` });
    }
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const payload = parsed.data;
    const adminOverride = hasAdminOverride(req.user?.role, parseBooleanQuery(req.query.adminOverride));
    const currentStatus = await getCurrentPlanningStatus(cycleId, employeeId);
    if (currentStatus === 'finalized' && !adminOverride) {
      return res.status(409).json({ error: 'plan_locked', message: 'Plan is finalized and locked. Admin override is required.' });
    }
    const disallowedFields = validateEditableFields(req.user?.role, currentStatus, payload, adminOverride);
    if (disallowedFields.length > 0) {
      return res.status(403).json({
        error: 'forbidden_fields',
        message: `Current status ${currentStatus} does not allow editing: ${disallowedFields.join(', ')}`,
        data: { planningStatus: currentStatus, disallowedFields }
      });
    }
    const prior = await pool.query(
      `SELECT prior_performance_rating AS "priorPerformanceRating",
              current_performance_rating AS "currentPerformanceRating",
              merit_increase_amount::float AS "meritIncreaseAmount",
              merit_increase_percent::float AS "meritIncreasePercent",
              recommended_merit_amount::float AS "recommendedMeritAmount",
              recommended_merit_percent::float AS "recommendedMeritPercent",
              variance_from_recommendation::float AS "varianceFromRecommendation",
              is_promotion AS "isPromotion",
              promotion_type AS "promotionType",
              new_job_title AS "newJobTitle",
              promotion_rationale AS "promotionRationale",
              promotion_increase_amount::float AS "promotionIncreaseAmount",
              bonus_override_amount::float AS "bonusOverrideAmount",
              bonus_override_percent::float AS "bonusOverridePercent",
              bonus_weight_company::float AS "bonusWeightCompany",
              bonus_weight_individual::float AS "bonusWeightIndividual",
              goal_attainment_company::float AS "goalAttainmentCompany",
              goal_attainment_individual::float AS "goalAttainmentIndividual",
              exec_review AS "execReview",
              notes,
              planning_status AS "planningStatus"
       FROM employee_cycle_plans
       WHERE cycle_id = $1 AND employee_id = $2`,
      [cycleId, employeeId]
    );
    const result = await pool.query(
      `INSERT INTO employee_cycle_plans (
        cycle_id, employee_id,
        prior_performance_rating, current_performance_rating,
        merit_increase_amount, merit_increase_percent,
        recommended_merit_amount, recommended_merit_percent,
        variance_from_recommendation,
        is_promotion, promotion_type, new_job_title, promotion_rationale,
        promotion_increase_amount,
        bonus_override_amount, bonus_override_percent,
        bonus_weight_company, bonus_weight_individual,
        goal_attainment_company, goal_attainment_individual,
        exec_review, notes, planning_status, planner_inputs,
        updated_at
      ) VALUES (
        $1, $2,
        $3, $4,
        $5, $6,
        $7, $8,
        $9,
        $10, $11, $12, $13,
        $14,
        $15, $16,
        $17, $18,
        $19, $20,
        $21, $22, $23, $24::jsonb,
        NOW()
      )
      ON CONFLICT (cycle_id, employee_id)
      DO UPDATE SET
        prior_performance_rating = EXCLUDED.prior_performance_rating,
        current_performance_rating = EXCLUDED.current_performance_rating,
        merit_increase_amount = EXCLUDED.merit_increase_amount,
        merit_increase_percent = EXCLUDED.merit_increase_percent,
        recommended_merit_amount = EXCLUDED.recommended_merit_amount,
        recommended_merit_percent = EXCLUDED.recommended_merit_percent,
        variance_from_recommendation = EXCLUDED.variance_from_recommendation,
        is_promotion = EXCLUDED.is_promotion,
        promotion_type = EXCLUDED.promotion_type,
        new_job_title = EXCLUDED.new_job_title,
        promotion_rationale = EXCLUDED.promotion_rationale,
        promotion_increase_amount = EXCLUDED.promotion_increase_amount,
        bonus_override_amount = EXCLUDED.bonus_override_amount,
        bonus_override_percent = EXCLUDED.bonus_override_percent,
        bonus_weight_company = EXCLUDED.bonus_weight_company,
        bonus_weight_individual = EXCLUDED.bonus_weight_individual,
        goal_attainment_company = EXCLUDED.goal_attainment_company,
        goal_attainment_individual = EXCLUDED.goal_attainment_individual,
        exec_review = EXCLUDED.exec_review,
        notes = EXCLUDED.notes,
        planning_status = COALESCE(EXCLUDED.planning_status, employee_cycle_plans.planning_status),
        planner_inputs = EXCLUDED.planner_inputs,
        updated_at = NOW()
      RETURNING *`,
      [
        cycleId,
        employeeId,
        payload.priorPerformanceRating ?? null,
        payload.currentPerformanceRating ?? null,
        payload.meritIncreaseAmount ?? null,
        payload.meritIncreasePercent ?? null,
        payload.recommendedMeritAmount ?? null,
        payload.recommendedMeritPercent ?? null,
        payload.varianceFromRecommendation ?? null,
        payload.isPromotion ?? null,
        payload.promotionType ?? null,
        payload.newJobTitle ?? null,
        payload.promotionRationale ?? null,
        payload.promotionIncreaseAmount ?? null,
        payload.bonusOverrideAmount ?? null,
        payload.bonusOverridePercent ?? null,
        payload.bonusWeightCompany ?? null,
        payload.bonusWeightIndividual ?? null,
        payload.goalAttainmentCompany ?? null,
        payload.goalAttainmentIndividual ?? null,
        payload.execReview ?? null,
        payload.notes ?? null,
        null,
        JSON.stringify(payload.plannerInputs ?? {})
      ]
    );
    const saved = result.rows[0];
    await writePlanAudit(cycleId, employeeId, prior.rows[0] ?? {}, {
      priorPerformanceRating: saved?.prior_performance_rating ?? null,
      currentPerformanceRating: saved?.current_performance_rating ?? null,
      meritIncreaseAmount: saved?.merit_increase_amount ?? null,
      meritIncreasePercent: saved?.merit_increase_percent ?? null,
      recommendedMeritAmount: saved?.recommended_merit_amount ?? null,
      recommendedMeritPercent: saved?.recommended_merit_percent ?? null,
      varianceFromRecommendation: saved?.variance_from_recommendation ?? null,
      isPromotion: saved?.is_promotion ?? null,
      promotionType: saved?.promotion_type ?? null,
      newJobTitle: saved?.new_job_title ?? null,
      promotionRationale: saved?.promotion_rationale ?? null,
      promotionIncreaseAmount: saved?.promotion_increase_amount ?? null,
      bonusOverrideAmount: saved?.bonus_override_amount ?? null,
      bonusOverridePercent: saved?.bonus_override_percent ?? null,
      bonusWeightCompany: saved?.bonus_weight_company ?? null,
      bonusWeightIndividual: saved?.bonus_weight_individual ?? null,
      goalAttainmentCompany: saved?.goal_attainment_company ?? null,
      goalAttainmentIndividual: saved?.goal_attainment_individual ?? null,
      execReview: saved?.exec_review ?? null,
      notes: saved?.notes ?? null,
      planningStatus: saved?.planning_status ?? null
    }, req.user?.email ?? 'unknown');
    await regenerateOutputsForCycle(cycleId);
    res.json({ data: saved });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.post('/cycles/:cycleId/plans/bulk', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    const parsed = bulkPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { employeeIds, filters, updates } = parsed.data;
    const clauses = ['1=1'];
    const values: Array<string | number | boolean> = [cycleId];
    if (employeeIds && employeeIds.length > 0) {
      values.push(employeeIds as unknown as string);
      clauses.push(`e.id = ANY($${values.length}::text[])`);
    }
    if (filters?.department) {
      values.push(filters.department);
      clauses.push(`e.department = $${values.length}`);
    }
    if (filters?.executiveEmail) {
      values.push(filters.executiveEmail);
      clauses.push(`lower(e.executive_email) = lower($${values.length})`);
    }
    if (filters?.location) {
      values.push(filters.location);
      clauses.push(`COALESCE(e.raw_attributes->>'location', '') = $${values.length}`);
    }
    if (filters?.businessEntity) {
      values.push(filters.businessEntity);
      clauses.push(`e.business_entity = $${values.length}`);
    }

    const executiveScope = buildExecutiveScopeWhere(req.user, { employeeAlias: 'e', startingParamIndex: values.length + 1, includeLeadingAnd: false });
    if (executiveScope.clause) {
      clauses.push(executiveScope.clause);
      values.push(...executiveScope.values);
    }

    const targets = await pool.query(
      `SELECT e.id AS "employeeId", p.planning_status AS "planningStatus"
       FROM employees e
       LEFT JOIN employee_cycle_plans p ON p.cycle_id = $1 AND p.employee_id = e.id
       LEFT JOIN employee_comp_outputs o ON o.cycle_id = $1 AND o.employee_id = e.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY e.id`,
      values
    );

    const updatedEmployeeIds: string[] = [];
    for (const target of targets.rows) {
      const employeeId = target.employeeId as string;
      const planningStatus = (target.planningStatus ?? 'not_started') as (typeof plannerStatusValues)[number];
      if (planningStatus === 'finalized' && req.user?.role !== 'admin') {
        continue;
      }
      await pool.query(
        `INSERT INTO employee_cycle_plans (cycle_id, employee_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cycle_id, employee_id) DO NOTHING`,
        [cycleId, employeeId]
      );
      const setParts: string[] = [];
      const setValues: Array<string | number | boolean | null> = [cycleId, employeeId];
      const pushSet = (col: string, value: unknown) => {
        setValues.push((value as string | number | boolean | null) ?? null);
        setParts.push(`${col} = $${setValues.length}`);
      };
      if (updates.meritIncreasePercent !== undefined) pushSet('merit_increase_percent', updates.meritIncreasePercent);
      if (updates.currentPerformanceRating !== undefined) pushSet('current_performance_rating', updates.currentPerformanceRating);
      if (updates.goalAttainmentCompany !== undefined) pushSet('goal_attainment_company', updates.goalAttainmentCompany);
      if (updates.goalAttainmentIndividual !== undefined) pushSet('goal_attainment_individual', updates.goalAttainmentIndividual);
      if (updates.isPromotion !== undefined) pushSet('is_promotion', updates.isPromotion);
      if (setParts.length === 0) continue;
      setParts.push('updated_at = NOW()');
      await pool.query(
        `UPDATE employee_cycle_plans SET ${setParts.join(', ')} WHERE cycle_id = $1 AND employee_id = $2`,
        setValues
      );
      updatedEmployeeIds.push(employeeId);
    }

    await regenerateOutputsForCycle(cycleId);
    res.json({ data: { updated: updatedEmployeeIds.length, employeeIds: updatedEmployeeIds } });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.put('/cycles/:cycleId/plans/:employeeId/status', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    const employeeId = String(req.params.employeeId);
    if (!(await assertEmployeeInScope(req.user!, employeeId))) {
      return res.status(404).json({ error: 'not_found', message: `Employee ${employeeId} not found in scope` });
    }
    const parsed = z.object({ status: plannerStatusSchema }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const currentStatus = await getCurrentPlanningStatus(cycleId, employeeId);
    const nextStatus = parsed.data.status;
    if (!statusTransitions[currentStatus].includes(nextStatus)) {
      return res.status(409).json({
        error: 'invalid_status_transition',
        message: `Cannot move from ${currentStatus} to ${nextStatus}`,
        data: { from: currentStatus, to: nextStatus }
      });
    }
    if (nextStatus === 'exec_reviewed' && !['admin', 'executive'].includes(req.user?.role ?? '')) {
      return res.status(403).json({ error: 'forbidden', message: 'Only executive/admin can mark exec_reviewed' });
    }
    if (nextStatus === 'finalized' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden', message: 'Only admin can finalize plans' });
    }
    await pool.query(
      `INSERT INTO employee_cycle_plans (cycle_id, employee_id, planning_status, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (cycle_id, employee_id)
       DO UPDATE SET planning_status = EXCLUDED.planning_status, updated_at = NOW()`,
      [cycleId, employeeId, parsed.data.status]
    );
    await pool.query(
      `INSERT INTO planner_change_audit (cycle_id, employee_id, field_name, old_value, new_value, changed_by)
       VALUES ($1, $2, 'planningStatus', to_jsonb($3::text), to_jsonb($4::text), $5)`,
      [cycleId, employeeId, currentStatus, nextStatus, req.user?.email ?? 'unknown']
    );
    res.json({ data: { employeeId, status: parsed.data.status } });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.get('/cycles/:cycleId/plans/:employeeId/audit', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    const employeeId = String(req.params.employeeId);
    if (!(await assertEmployeeInScope(req.user!, employeeId))) {
      return res.status(404).json({ error: 'not_found', message: `Employee ${employeeId} not found in scope` });
    }
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 200);
    const result = await pool.query(
      `SELECT id,
              cycle_id AS "cycleId",
              employee_id AS "employeeId",
              field_name AS "fieldName",
              old_value AS "oldValue",
              new_value AS "newValue",
              changed_by AS "changedBy",
              changed_at AS "changedAt"
       FROM planner_change_audit
       WHERE cycle_id = $1 AND employee_id = $2
       ORDER BY changed_at DESC
       LIMIT $3`,
      [cycleId, employeeId, limit]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.get('/cycles/:cycleId/outputs', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    await regenerateOutputsForCycle(cycleId);
    const executiveScope = buildExecutiveScopeWhere(req.user, { employeeAlias: 'e', startingParamIndex: 2 });
    const values: Array<string | number> = [cycleId, ...executiveScope.values];
    const outputs = await pool.query(
      `SELECT cycle_id AS "cycleId", employee_id AS "employeeId",
              compa_ratio::float AS "compaRatio",
              salary_after_merit::float AS "salaryAfterMerit",
              final_salary_with_promo::float AS "finalSalaryWithPromo",
              current_bonus_target_amount::float AS "currentBonusTargetAmount",
              final_company_bonus_prorated::float AS "finalCompanyBonusProrated",
              final_individual_bonus_prorated::float AS "finalIndividualBonusProrated",
              final_total_bonus_prorated::float AS "finalTotalBonusProrated",
              new_range_compa_ratio::float AS "newRangeCompaRatio",
              variance_from_recommendation::float AS "varianceFromRecommendation",
              gap_flags AS "gapFlags",
              missing_data_reasons AS "missingDataReasons",
              calc_version AS "calcVersion",
              generated_at AS "generatedAt"
       FROM employee_comp_outputs o
       JOIN employees e ON e.id = o.employee_id
       WHERE o.cycle_id = $1${executiveScope.clause}
       ORDER BY employee_id`,
      values
    );
    res.json({ data: outputs.rows });
  } catch (error) {
    next(error);
  }
});
compensationCyclesRouter.get('/cycles/:cycleId/total-summary', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    await regenerateOutputsForCycle(cycleId);
    const rows = await fetchTotalSummaryRows(cycleId, req.user, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      department: typeof req.query.department === 'string' ? req.query.department : undefined,
      promotionOnly: parseBooleanQuery(req.query.promotionOnly)
    });
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});


const parityReviewSchema = z.object({
  expected: z.array(z.object({
    employeeId: z.string(),
    fields: z.record(z.any())
  })).min(1)
});

const exportCompareSchema = z.object({
  expected: z.array(z.object({
    employeeId: z.string(),
    fields: z.record(z.any())
  })).min(1),
  fields: z.array(z.string()).optional()
});

compensationCyclesRouter.post('/cycles/:cycleId/parity-review', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    const parsed = parityReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    await regenerateOutputsForCycle(cycleId);
    const rows = await fetchTotalSummaryRows(cycleId, req.user);
    const byEmployee = new Map(rows.map((row) => [String(row.employeeId), row]));
    const mismatches: Array<{ employeeId: string; field: string; expected: unknown; actual: unknown }> = [];
    for (const record of parsed.data.expected) {
      const actual = byEmployee.get(record.employeeId);
      for (const [field, expectedValue] of Object.entries(record.fields)) {
        const actualValue = actual?.[field as keyof (typeof rows)[number]] ?? null;
        if (!sameValue(actualValue, expectedValue)) {
          mismatches.push({ employeeId: record.employeeId, field, expected: expectedValue, actual: actualValue });
        }
      }
    }
    const mismatchesByEmployee = mismatches.reduce<Record<string, Array<{ field: string; expected: unknown; actual: unknown }>>>(
      (acc, mismatch) => {
        acc[mismatch.employeeId] ??= [];
        acc[mismatch.employeeId].push({ field: mismatch.field, expected: mismatch.expected, actual: mismatch.actual });
        return acc;
      },
      {}
    );
    const mismatchesByField = mismatches.reduce<Record<string, number>>((acc, mismatch) => {
      acc[mismatch.field] = (acc[mismatch.field] ?? 0) + 1;
      return acc;
    }, {});
    res.json({
      data: {
        comparedEmployees: parsed.data.expected.length,
        mismatchCount: mismatches.length,
        mismatches,
        mismatchesByEmployee,
        mismatchesByField
      }
    });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.post('/cycles/:cycleId/export-compare', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    const parsed = exportCompareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    await regenerateOutputsForCycle(cycleId);
    const rows = await fetchTotalSummaryRows(cycleId, req.user);
    const byEmployee = new Map(rows.map((row) => [String(row.employeeId), row]));
    const selectedFields = parsed.data.fields && parsed.data.fields.length > 0 ? new Set(parsed.data.fields) : null;
    const mismatches: Array<{ employeeId: string; field: string; expected: unknown; actual: unknown }> = [];
    for (const record of parsed.data.expected) {
      const actual = byEmployee.get(record.employeeId);
      for (const [field, expectedValue] of Object.entries(record.fields)) {
        if (selectedFields && !selectedFields.has(field)) continue;
        const actualValue = actual?.[field as keyof (typeof rows)[number]] ?? null;
        if (!sameValue(actualValue, expectedValue)) {
          mismatches.push({ employeeId: record.employeeId, field, expected: expectedValue, actual: actualValue });
        }
      }
    }
    res.json({
      data: {
        comparedEmployees: parsed.data.expected.length,
        comparedFields: selectedFields ? Array.from(selectedFields) : null,
        mismatchCount: mismatches.length,
        mismatches
      }
    });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.get('/cycles/:cycleId/total-summary.export', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    await regenerateOutputsForCycle(cycleId);
    const filterSummary = {
      search: typeof req.query.search === 'string' ? req.query.search : null,
      department: typeof req.query.department === 'string' ? req.query.department : null,
      promotionOnly: parseBooleanQuery(req.query.promotionOnly)
    };
    const rows = await fetchTotalSummaryRows(cycleId, req.user, {
      search: filterSummary.search ?? undefined,
      department: filterSummary.department ?? undefined,
      promotionOnly: filterSummary.promotionOnly
    });
    res.json({
      data: {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        cycleId,
        generatedAt: new Date().toISOString(),
        filters: filterSummary,
        columns: TOTAL_SUMMARY_COLUMNS,
        rowCount: rows.length,
        rows
      }
    });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.get('/cycles/:cycleId/total-summary.csv', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'executive'])) return;
  try {
    const cycleId = Number(req.params.cycleId);
    await regenerateOutputsForCycle(cycleId);
    const filterSummary = {
      search: typeof req.query.search === 'string' ? req.query.search : null,
      department: typeof req.query.department === 'string' ? req.query.department : null,
      promotionOnly: parseBooleanQuery(req.query.promotionOnly)
    };
    const rows = await fetchTotalSummaryRows(cycleId, req.user, {
      search: filterSummary.search ?? undefined,
      department: filterSummary.department ?? undefined,
      promotionOnly: filterSummary.promotionOnly
    });
    const header = TOTAL_SUMMARY_COLUMNS.join(',');
    const body = rows
      .map((row) => TOTAL_SUMMARY_COLUMNS.map((column) => toCsvCell(row[column])).join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="compensation-total-summary-${cycleId}.csv"`);
    res.setHeader('X-Export-Schema-Version', EXPORT_SCHEMA_VERSION);
    res.setHeader('X-Export-Cycle-Id', String(cycleId));
    res.setHeader('X-Export-Generated-At', new Date().toISOString());
    res.setHeader('X-Export-Filter-Summary', JSON.stringify(filterSummary));
    res.send(`${header}\n${body}`);
  } catch (error) {
    next(error);
  }
});
