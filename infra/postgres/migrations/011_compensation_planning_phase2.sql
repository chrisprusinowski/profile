CREATE TABLE IF NOT EXISTS compensation_cycles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  cycle_type TEXT,
  open_date DATE,
  close_date DATE,
  effective_date DATE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_cycle_plans (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES compensation_cycles (id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  prior_performance_rating TEXT,
  current_performance_rating TEXT,
  merit_increase_amount NUMERIC(14,2),
  merit_increase_percent NUMERIC(8,4),
  recommended_merit_amount NUMERIC(14,2),
  recommended_merit_percent NUMERIC(8,4),
  variance_from_recommendation NUMERIC(14,2),
  is_promotion BOOLEAN,
  promotion_type TEXT,
  new_job_title TEXT,
  promotion_rationale TEXT,
  promotion_increase_amount NUMERIC(14,2),
  bonus_override_amount NUMERIC(14,2),
  bonus_override_percent NUMERIC(8,4),
  bonus_weight_company NUMERIC(8,4),
  bonus_weight_individual NUMERIC(8,4),
  goal_attainment_company NUMERIC(8,4),
  goal_attainment_individual NUMERIC(8,4),
  exec_review TEXT,
  notes TEXT,
  planner_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS employee_cycle_plans_cycle_idx ON employee_cycle_plans (cycle_id);
CREATE INDEX IF NOT EXISTS employee_cycle_plans_employee_idx ON employee_cycle_plans (employee_id);

CREATE TABLE IF NOT EXISTS employee_comp_outputs (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES compensation_cycles (id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  compa_ratio NUMERIC(10,6),
  salary_after_merit NUMERIC(14,2),
  final_salary_with_promo NUMERIC(14,2),
  current_bonus_target_amount NUMERIC(14,2),
  final_company_bonus_prorated NUMERIC(14,2),
  final_individual_bonus_prorated NUMERIC(14,2),
  final_total_bonus_prorated NUMERIC(14,2),
  new_range_compa_ratio NUMERIC(10,6),
  variance_from_recommendation NUMERIC(14,2),
  gap_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_data_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  calc_version TEXT NOT NULL DEFAULT 'v1',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS employee_comp_outputs_cycle_idx ON employee_comp_outputs (cycle_id);
CREATE INDEX IF NOT EXISTS employee_comp_outputs_employee_idx ON employee_comp_outputs (employee_id);
