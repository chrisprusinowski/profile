CREATE TABLE IF NOT EXISTS app_users (
  email         TEXT PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'executive', 'manager')),
  manager_name  TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_users (email, role, manager_name, is_active)
VALUES
  ('admin@demo.com', 'admin', NULL, true),
  ('executive@demo.com', 'executive', NULL, true),
  ('manager1@demo.com', 'manager', 'Jamie Rivera', true),
  ('manager2@demo.com', 'manager', 'Jordan Pike', true)
ON CONFLICT (email) DO UPDATE
SET role = EXCLUDED.role,
    manager_name = EXCLUDED.manager_name,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
