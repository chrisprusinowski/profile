ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS position_type TEXT,
  ADD COLUMN IF NOT EXISTS geography TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT;

CREATE INDEX IF NOT EXISTS employees_position_type_idx ON employees (position_type);
CREATE INDEX IF NOT EXISTS employees_geography_idx ON employees (geography);

CREATE TABLE IF NOT EXISTS pay_ranges (
  id BIGSERIAL PRIMARY KEY,
  range_name TEXT,
  job_family TEXT,
  position_type TEXT,
  job_title_reference TEXT,
  level TEXT,
  geography TEXT,
  geo_tier TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  salary_min NUMERIC(14, 2) NOT NULL,
  salary_mid NUMERIC(14, 2) NOT NULL,
  salary_max NUMERIC(14, 2) NOT NULL,
  effective_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pay_ranges_salary_order_check CHECK (salary_min <= salary_mid AND salary_mid <= salary_max)
);

CREATE INDEX IF NOT EXISTS pay_ranges_active_idx ON pay_ranges (is_active);
CREATE INDEX IF NOT EXISTS pay_ranges_match_idx ON pay_ranges (position_type, job_family, job_title_reference, level, geography);
