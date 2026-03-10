import { Router } from 'express';
import { readFile } from 'fs/promises';
import { z } from 'zod';
import { pool } from '../db.js';

export const employeesRouter = Router();

const employeeSchema = z.object({
  id: z.string().trim().min(1, 'id is required').max(128),
  name: z.string().trim().min(1, 'name is required').max(255),
  email: z.string().trim().email('email must be valid').max(255).optional().or(z.literal('')),
  department: z.string().trim().max(255).optional().or(z.literal('')),
  title: z.string().trim().max(255).optional().or(z.literal('')),
  salary: z.coerce.number().finite().min(0, 'salary must be >= 0'),
  manager: z.string().trim().max(255).optional().or(z.literal('')),
  hireDate: z.string().trim().optional().or(z.literal('')),
});

const employeeUpdateSchema = employeeSchema.omit({ id: true });

const requiredCsvColumns = ['id', 'name', 'email', 'department', 'title', 'salary', 'manager', 'hire_date'];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
}

function parseDateInput(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function fetchEmployeesFromDb() {
  const result = await pool.query(
    `SELECT id,
            name,
            email,
            department,
            title,
            salary::float AS salary,
            manager,
            to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"
     FROM employees
     ORDER BY name ASC, id ASC`,
  );

  return result.rows;
}

employeesRouter.get('/', async (_req, res, next) => {
  try {
    const employees = await fetchEmployeesFromDb();
    res.json({ success: true, data: employees });
  } catch (error) {
    next(error);
  }
});

employeesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const employee = parsed.data;
    const hireDate = parseDateInput(employee.hireDate);
    if (employee.hireDate && !hireDate) {
      res.status(400).json({ success: false, error: 'hireDate must be a valid date (YYYY-MM-DD)' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO employees (id, name, email, department, title, salary, manager, hire_date)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, NULLIF($7, ''), $8)
       RETURNING id,
                 name,
                 email,
                 department,
                 title,
                 salary::float AS salary,
                 manager,
                 to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"`,
      [employee.id, employee.name, employee.email ?? '', employee.department ?? '', employee.title ?? '', employee.salary, employee.manager ?? '', hireDate],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ success: false, error: 'Employee with this id already exists' });
      return;
    }
    next(error);
  }
});

employeesRouter.put('/:id', async (req, res, next) => {
  try {
    const parsed = employeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const hireDate = parseDateInput(parsed.data.hireDate);
    if (parsed.data.hireDate && !hireDate) {
      res.status(400).json({ success: false, error: 'hireDate must be a valid date (YYYY-MM-DD)' });
      return;
    }

    const result = await pool.query(
      `UPDATE employees
       SET name = $1,
           email = NULLIF($2, ''),
           department = NULLIF($3, ''),
           title = NULLIF($4, ''),
           salary = $5,
           manager = NULLIF($6, ''),
           hire_date = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING id,
                 name,
                 email,
                 department,
                 title,
                 salary::float AS salary,
                 manager,
                 to_char(hire_date, 'YYYY-MM-DD') AS "hireDate"`,
      [parsed.data.name, parsed.data.email ?? '', parsed.data.department ?? '', parsed.data.title ?? '', parsed.data.salary, parsed.data.manager ?? '', hireDate, req.params.id],
    );

    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: 'Employee not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

employeesRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [req.params.id]);

    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: 'Employee not found' });
      return;
    }

    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    next(error);
  }
});

employeesRouter.post('/import-csv', async (req, res, next) => {
  try {
    const payload = req.body as { csvContent?: string; filePath?: string };
    let csvContent = payload.csvContent;

    if (!csvContent && payload.filePath) {
      csvContent = await readFile(payload.filePath, 'utf-8');
    }

    if (!csvContent) {
      res.status(400).json({ success: false, error: 'Provide csvContent or filePath' });
      return;
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      res.status(400).json({ success: false, error: 'CSV must include header and at least one data row' });
      return;
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    const missingColumns = requiredCsvColumns.filter((col) => !headers.includes(col));

    if (missingColumns.length > 0) {
      res.status(400).json({
        success: false,
        error: `Missing required CSV columns: ${missingColumns.join(', ')}`,
      });
      return;
    }

    let rowsProcessed = 0;
    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    const validationErrors: Array<{ row: number; error: string }> = [];

    for (const [index, line] of lines.slice(1).entries()) {
      const rowNumber = index + 2;
      rowsProcessed += 1;
      const values = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = values[i] ?? '';
      });

      const validation = employeeSchema.safeParse({
        id: row.id,
        name: row.name,
        email: row.email,
        department: row.department,
        title: row.title,
        salary: row.salary,
        manager: row.manager,
        hireDate: row.hire_date,
      });

      if (!validation.success) {
        rejected += 1;
        validationErrors.push({ row: rowNumber, error: validation.error.issues.map((issue) => issue.message).join('; ') });
        continue;
      }

      const hireDate = parseDateInput(validation.data.hireDate);
      if (validation.data.hireDate && !hireDate) {
        rejected += 1;
        validationErrors.push({ row: rowNumber, error: 'Invalid hire_date value. Expected YYYY-MM-DD' });
        continue;
      }

      const upsertResult = await pool.query(
        `INSERT INTO employees (id, name, email, department, title, salary, manager, hire_date)
         VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, NULLIF($7, ''), $8)
         ON CONFLICT (id)
         DO UPDATE SET name = EXCLUDED.name,
                       email = EXCLUDED.email,
                       department = EXCLUDED.department,
                       title = EXCLUDED.title,
                       salary = EXCLUDED.salary,
                       manager = EXCLUDED.manager,
                       hire_date = EXCLUDED.hire_date,
                       updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [validation.data.id, validation.data.name, validation.data.email ?? '', validation.data.department ?? '', validation.data.title ?? '', validation.data.salary, validation.data.manager ?? '', hireDate],
      );

      if (upsertResult.rows[0]?.inserted) {
        inserted += 1;
      } else {
        updated += 1;
      }
    }

    res.json({
      success: true,
      data: {
        rowsProcessed,
        inserted,
        updated,
        rejected,
        validationErrors,
      },
    });
  } catch (error) {
    next(error);
  }
});
