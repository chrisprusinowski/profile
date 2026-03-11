ALTER TABLE merit_cycles
  ADD COLUMN IF NOT EXISTS merit_budget_percent NUMERIC(6,3) NOT NULL DEFAULT 3.5,
  ADD COLUMN IF NOT EXISTS bonus_budget_percent NUMERIC(6,3) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS guideline_max_percent NUMERIC(6,3) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS enable_proration BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proration_start_date DATE,
  ADD COLUMN IF NOT EXISTS eligibility_cutoff_date DATE,
  ADD COLUMN IF NOT EXISTS min_tenure_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allow_eligibility_override BOOLEAN NOT NULL DEFAULT false;

UPDATE merit_cycles
SET merit_budget_percent = COALESCE(merit_budget_percent, budget_pct, 3.5),
    guideline_max_percent = COALESCE(guideline_max_percent, guideline_max, 10)
WHERE merit_budget_percent IS NULL
   OR guideline_max_percent IS NULL;

ALTER TABLE merit_cycles
  DROP CONSTRAINT IF EXISTS merit_cycles_merit_budget_percent_range,
  DROP CONSTRAINT IF EXISTS merit_cycles_bonus_budget_percent_range,
  DROP CONSTRAINT IF EXISTS merit_cycles_guideline_max_percent_range,
  DROP CONSTRAINT IF EXISTS merit_cycles_min_tenure_days_non_negative,
  DROP CONSTRAINT IF EXISTS merit_cycles_proration_dates_logical;

ALTER TABLE merit_cycles
  ADD CONSTRAINT merit_cycles_merit_budget_percent_range CHECK (merit_budget_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT merit_cycles_bonus_budget_percent_range CHECK (bonus_budget_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT merit_cycles_guideline_max_percent_range CHECK (guideline_max_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT merit_cycles_min_tenure_days_non_negative CHECK (min_tenure_days >= 0),
  ADD CONSTRAINT merit_cycles_proration_dates_logical CHECK (
    proration_start_date IS NULL OR eligibility_cutoff_date IS NULL OR proration_start_date < eligibility_cutoff_date
  );
