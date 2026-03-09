-- Merit cycle configuration
CREATE TABLE IF NOT EXISTS merit_cycles (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'merit',
  open_date       DATE,
  close_date      DATE,
  effective_date  DATE,
  total_payroll   NUMERIC(16, 2),
  budget_pct      NUMERIC(6, 3) DEFAULT 3.5,
  budget_total    NUMERIC(16, 2),
  guideline_min   NUMERIC(6, 3) DEFAULT 0,
  guideline_max   NUMERIC(6, 3) DEFAULT 10,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merit recommendations — one row per (cycle, employee)
CREATE TABLE IF NOT EXISTS merit_recommendations (
  id              SERIAL PRIMARY KEY,
  cycle_id        INTEGER NOT NULL REFERENCES merit_cycles (id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL,
  merit_pct       NUMERIC(6, 3) NOT NULL DEFAULT 0,
  rating          TEXT NOT NULL DEFAULT 'Meets Expectations',
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'Draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS merit_recs_cycle_idx ON merit_recommendations (cycle_id);
CREATE INDEX IF NOT EXISTS merit_recs_employee_idx ON merit_recommendations (employee_id);

-- Insert a default cycle if none exists yet
INSERT INTO merit_cycles (name, type, open_date, close_date, effective_date, budget_pct, guideline_max, status)
SELECT '2026 Annual Merit Cycle', 'merit', '2026-03-01', '2026-04-15', '2026-07-01', 3.5, 10, 'open'
WHERE NOT EXISTS (SELECT 1 FROM merit_cycles);
