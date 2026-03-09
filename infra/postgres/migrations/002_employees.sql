-- Employee roster table
-- Populated by syncing from data/employees.csv via the API's CSV watcher.
-- The API upserts rows on file change so this always reflects the latest CSV.

CREATE TABLE IF NOT EXISTS employees (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  department    TEXT,
  title         TEXT,
  salary        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  manager       TEXT,
  hire_date     DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employees_department_idx ON employees (department);
