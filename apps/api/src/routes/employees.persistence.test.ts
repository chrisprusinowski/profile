import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockLogAuditEvent = vi.fn();
const mockRecalculate = vi.fn();

vi.mock('../db.js', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect
  }
}));

vi.mock('../audit.js', () => ({
  logAuditEvent: mockLogAuditEvent
}));

vi.mock('../recommendationCalculations.js', () => ({
  recalculateRecommendationAmountsForEmployee: mockRecalculate
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { email: 'admin@demo.com', role: 'admin', executiveName: null, executiveEmail: null, isActive: true };
    next();
  });
  return import('./employees.js').then(({ employeesRouter }) => {
    app.use('/api/v1/employees', employeesRouter);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    });
    return app;
  });
}

describe('employees persistence path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('current_database()')) {
        return { rows: [{ databaseName: 'merit', schemaName: 'public' }], rowCount: 1 };
      }
      if (sql.includes('FROM pay_ranges')) return { rows: [] };
      if (sql.includes('FROM employees')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    });
  });

  it('returns preview by default and does not write rows', async () => {
    const txQuery = vi.fn();
    mockConnect.mockResolvedValue({ query: txQuery, release: vi.fn() });

    const app = await makeApp();
    const csv = [
      'EID,Employee Name,Current Salary,Manager,Hire Date',
      'E100,Jane,100000,Leader,2024-01-01'
    ].join('\n');

    const response = await request(app).post('/api/v1/employees/import-csv').send({ csvContent: csv });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      rowsReceived: 1,
      rowsNormalized: 1
    });
    expect(txQuery).not.toHaveBeenCalled();
  });

  it('successful commit persists to DB and returns counters', async () => {
    const txQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO import_batches')) return { rows: [{ id: 77 }], rowCount: 1 };
      if (sql.includes('INSERT INTO employees')) {
        return { rows: [{ inserted: (params?.[0] as string) === 'E100' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    mockConnect.mockResolvedValue({ query: txQuery, release: vi.fn() });

    const app = await makeApp();
    const csv = [
      'EID,Employee Name,Current Salary,Manager,Hire Date',
      'E100,Jane,100000,Leader,2024-01-01',
      'E101,John,110000,Leader,2024-01-01'
    ].join('\n');

    const response = await request(app).post('/api/v1/employees/import-csv').send({ action: 'commit', csvContent: csv });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      rowsReceived: 2,
      rowsInserted: 1,
      rowsUpdated: 1,
      rowsWithWarnings: 2,
      batchId: 77
    });
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('accepts malformed rows and tracks warnings instead of rejecting commit', async () => {
    const txQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO import_batches')) return { rows: [{ id: 99 }], rowCount: 1 };
      if (sql.includes('INSERT INTO employees')) return { rows: [{ inserted: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    mockConnect.mockResolvedValue({ query: txQuery, release: vi.fn() });

    const app = await makeApp();
    const csv = [
      'EID,Employee Name,Current Salary,Hire Date',
      ',No Salary,abc,2024-13-01'
    ].join('\n');

    const response = await request(app).post('/api/v1/employees/import-csv').send({ action: 'commit', csvContent: csv });
    expect(response.status).toBe(200);
    expect(response.body.data.rowsReceived).toBe(1);
    expect(response.body.data.rowsWithWarnings).toBe(1);
  });

  it('roster shows imported rows immediately after import from same source table', async () => {
    const employeesTable: Array<Record<string, unknown>> = [];

    mockConnect.mockResolvedValue({
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
        if (sql.includes('INSERT INTO import_batches')) return { rows: [{ id: 120 }], rowCount: 1 };
        if (sql.includes('INSERT INTO employees')) {
          employeesTable.push({
            id: params?.[0],
            name: params?.[1],
            email: null,
            department: params?.[3],
            title: params?.[4],
            positionType: null,
            geography: null,
            level: params?.[7],
            salary: Number(params?.[8] ?? 0),
            manager: params?.[9],
            executiveEmail: params?.[10],
            hireDate: String(params?.[11] ?? '')
          });
          return { rows: [{ inserted: true }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('current_database()')) {
        return { rows: [{ databaseName: 'merit', schemaName: 'public' }], rowCount: 1 };
      }
      if (sql.includes('FROM pay_ranges')) return { rows: [] };
      if (sql.includes('FROM employees')) return { rows: employeesTable };
      return { rows: [], rowCount: 0 };
    });

    const app = await makeApp();
    const csv = [
      'EID,Employee Name,Current Salary,Department,Job Title,Manager,Hire Date',
      'E300,Roster Person,90000,Ops,Analyst,Boss,2024-02-01'
    ].join('\n');

    const importRes = await request(app).post('/api/v1/employees/import-csv').send({ action: 'commit', csvContent: csv });
    expect(importRes.status).toBe(200);

    const rosterRes = await request(app).get('/api/v1/employees');
    expect(rosterRes.status).toBe(200);
    expect(rosterRes.body.data).toHaveLength(employeesTable.length);
    expect(rosterRes.body.data[0].id).toBe('E300');
    const selectSqlCalls = mockQuery.mock.calls.map((call) => String(call[0]));
    expect(selectSqlCalls.some((sql) => sql.includes('FROM employees'))).toBe(true);
  });

  it('rolls back transaction and surfaces DB error', async () => {
    const txQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO import_batches')) return { rows: [{ id: 44 }], rowCount: 1 };
      if (sql.includes('INSERT INTO employees')) throw new Error('db exploded');
      return { rows: [], rowCount: 0 };
    });
    mockConnect.mockResolvedValue({ query: txQuery, release: vi.fn() });

    const app = await makeApp();
    const csv = [
      'EID,Employee Name,Current Salary,Manager,Hire Date',
      'E400,Jane,100000,Leader,2024-01-01'
    ].join('\n');

    const response = await request(app).post('/api/v1/employees/import-csv').send({ action: 'commit', csvContent: csv });
    expect(response.status).toBe(500);
    expect(response.body.error).toContain('db exploded');
    expect(txQuery).toHaveBeenCalledWith('ROLLBACK');
  });
});
