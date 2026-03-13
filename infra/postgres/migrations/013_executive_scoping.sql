ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS executive_name TEXT,
  ADD COLUMN IF NOT EXISTS executive_email TEXT;

CREATE INDEX IF NOT EXISTS employees_executive_email_idx ON employees (lower(executive_email));

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS executive_name TEXT,
  ADD COLUMN IF NOT EXISTS executive_email TEXT;

-- seed demo assignments for executive access model
UPDATE app_users
SET executive_email = lower(email)
WHERE role = 'executive' AND (executive_email IS NULL OR executive_email = '');
