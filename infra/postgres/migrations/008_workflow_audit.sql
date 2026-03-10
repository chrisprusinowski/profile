ALTER TABLE merit_cycles
  DROP CONSTRAINT IF EXISTS merit_cycles_status_check;

ALTER TABLE merit_cycles
  ADD CONSTRAINT merit_cycles_status_check
  CHECK (status IN ('open', 'closed', 'locked'));

ALTER TABLE merit_recommendations
  ADD COLUMN IF NOT EXISTS merit_amount NUMERIC(16, 2),
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT;

UPDATE merit_recommendations
SET status = CASE
  WHEN lower(status) = 'approved' THEN 'Locked'
  WHEN lower(status) = 'flagged' THEN 'Submitted'
  WHEN lower(status) = 'submitted' THEN 'Submitted'
  ELSE 'Draft'
END;

ALTER TABLE merit_recommendations
  DROP CONSTRAINT IF EXISTS merit_recommendations_status_check;

ALTER TABLE merit_recommendations
  ADD CONSTRAINT merit_recommendations_status_check
  CHECK (status IN ('Draft', 'Submitted', 'Locked'));

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS manager_email TEXT;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS manager_email TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  target_entity TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action_type);
