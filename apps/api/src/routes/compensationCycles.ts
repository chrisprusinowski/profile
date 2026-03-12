import { Router } from 'express';
import { z } from 'zod';
import { requireRole, type AuthenticatedRequest } from '../auth.js';
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

compensationCyclesRouter.get('/cycles/:cycleId/plans', async (req, res, next) => {
  try {
    const cycleId = Number(req.params.cycleId);
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
              p.planner_inputs AS "plannerInputs"
       FROM employees e
       LEFT JOIN employee_cycle_plans p
         ON p.employee_id = e.id AND p.cycle_id = $1
       ORDER BY e.id`,
      [cycleId]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.put('/cycles/:cycleId/plans/:employeeId', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin', 'manager'])) return;

  try {
    const cycleId = Number(req.params.cycleId);
    const employeeId = req.params.employeeId;
    const parsed = planSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const payload = parsed.data;
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
        exec_review, notes, planner_inputs,
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
        $21, $22, $23::jsonb,
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
        JSON.stringify(payload.plannerInputs ?? {})
      ]
    );

    await regenerateOutputsForCycle(cycleId);

    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.get('/cycles/:cycleId/outputs', async (req, res, next) => {
  try {
    const cycleId = Number(req.params.cycleId);
    await regenerateOutputsForCycle(cycleId);

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
       FROM employee_comp_outputs
       WHERE cycle_id = $1
       ORDER BY employee_id`,
      [cycleId]
    );

    res.json({ data: outputs.rows });
  } catch (error) {
    next(error);
  }
});

compensationCyclesRouter.get('/cycles/:cycleId/total-summary', async (req, res, next) => {
  try {
    const cycleId = Number(req.params.cycleId);
    await regenerateOutputsForCycle(cycleId);

    const result = await pool.query(
      `SELECT e.id AS "employeeId",
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
       ORDER BY e.id`,
      [cycleId]
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
