ALTER TABLE employee_cycle_plans
  ADD COLUMN IF NOT EXISTS planning_status TEXT NOT NULL DEFAULT 'not_started';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employee_cycle_plans_planning_status_check'
  ) THEN
    ALTER TABLE employee_cycle_plans
      ADD CONSTRAINT employee_cycle_plans_planning_status_check
      CHECK (planning_status IN ('not_started', 'in_progress', 'manager_submitted', 'exec_reviewed', 'finalized'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS planner_change_audit (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES compensation_cycles (id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS planner_change_audit_cycle_employee_idx
  ON planner_change_audit (cycle_id, employee_id, changed_at DESC);
