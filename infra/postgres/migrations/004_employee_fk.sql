-- Ensure merit recommendations remain coherent with employees.
-- Any recommendation must reference an existing employee record.

DELETE FROM merit_recommendations mr
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = mr.employee_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merit_recommendations_employee_id_fkey'
  ) THEN
    ALTER TABLE merit_recommendations
      ADD CONSTRAINT merit_recommendations_employee_id_fkey
      FOREIGN KEY (employee_id)
      REFERENCES employees (id)
      ON DELETE CASCADE;
  END IF;
END $$;
