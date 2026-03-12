CREATE TABLE IF NOT EXISTS import_batches (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'csv',
  source_name TEXT,
  actor_email TEXT,
  action TEXT NOT NULL DEFAULT 'commit' CHECK (action IN ('preview', 'commit')),
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'failed')),
  rows_received INTEGER NOT NULL DEFAULT 0,
  rows_normalized INTEGER NOT NULL DEFAULT 0,
  rows_with_warnings INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_batches_created_idx ON import_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS import_column_mappings (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
  source_column TEXT NOT NULL,
  canonical_column TEXT,
  is_recognized BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, source_column)
);

CREATE TABLE IF NOT EXISTS imported_employee_rows (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  employee_id TEXT,
  raw_row_json JSONB NOT NULL,
  normalized_row_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  unmapped_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS imported_employee_rows_batch_idx ON imported_employee_rows (batch_id);
CREATE INDEX IF NOT EXISTS imported_employee_rows_employee_idx ON imported_employee_rows (employee_id);

ALTER TABLE employees
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN salary DROP NOT NULL,
  ALTER COLUMN salary DROP DEFAULT;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS job_family_group TEXT,
  ADD COLUMN IF NOT EXISTS job_family TEXT,
  ADD COLUMN IF NOT EXISTS business_entity TEXT,
  ADD COLUMN IF NOT EXISTS employment_classification TEXT,
  ADD COLUMN IF NOT EXISTS flsa_status TEXT,
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS range_low NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS range_mid NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS range_high NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS compa_ratio NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS bonus_target_percent NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS total_cash NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS total_comp NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS raw_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS import_batch_id BIGINT REFERENCES import_batches (id) ON DELETE SET NULL;
