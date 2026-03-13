import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockLogAuditEvent = vi.fn();

vi.mock('../db.js', () => ({
  pool: {
    query: mockQuery
  }
}));

vi.mock('../audit.js', () => ({
  logAuditEvent: mockLogAuditEvent
}));

function makeApp(user: {
  email: string;
  role: 'admin' | 'executive' | 'manager';
  executiveName: string | null;
  executiveEmail: string | null;
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { ...user, isActive: true };
    next();
  });
  return import('./recommendations.js').then(({ recommendationsRouter }) => {
    app.use('/api/v1/recommendations', recommendationsRouter);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
    return app;
  });
}

describe('recommendations routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds missing recommendation rows from employees so imported employees appear', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM merit_cycles')) {
        return {
          rows: [{ id: 7, status: 'open', effectiveDate: '2026-07-01', minTenureDays: 0, allowEligibilityOverride: false, enableProration: false, prorationStartDate: null, eligibilityCutoffDate: null }],
          rowCount: 1
        };
      }
      if (sql.includes('INSERT INTO merit_recommendations')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM merit_recommendations') && sql.includes('employee_id AS "employeeId"')) {
        return {
          rows: [
            {
              employeeId: 'E900',
              meritPct: 0,
              meritAmount: 0,
              performanceRating: 2,
              bonusTargetPercent: null,
              bonusPayoutPercent: 0,
              bonusPayoutAmount: 0,
              notes: '',
              status: 'Draft',
              updatedAt: '2026-03-01T00:00:00.000Z'
            }
          ],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const app = await makeApp({
      email: 'admin@demo.com',
      role: 'admin',
      executiveName: null,
      executiveEmail: null
    });

    const response = await request(app).get('/api/v1/recommendations');
    expect(response.status).toBe(200);
    expect(response.body.E900).toBeDefined();

    const sqlCalls = mockQuery.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO merit_recommendations'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('FROM employees e'))).toBe(true);
  });

  it('executive scoped query uses executive email', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM merit_cycles')) {
        return {
          rows: [{ id: 3, status: 'open', effectiveDate: '2026-07-01', minTenureDays: 0, allowEligibilityOverride: false, enableProration: false, prorationStartDate: null, eligibilityCutoffDate: null }],
          rowCount: 1
        };
      }
      if (sql.includes('INSERT INTO merit_recommendations')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM merit_recommendations mr') && sql.includes('INNER JOIN employees e')) {
        return {
          rows: [{ employeeId: 'E901', meritPct: 0, meritAmount: 0, performanceRating: 2, bonusTargetPercent: null, bonusPayoutPercent: 0, bonusPayoutAmount: 0, notes: '', status: 'Draft' }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const app = await makeApp({
      email: 'executive@demo.com',
      role: 'executive',
      executiveName: null,
      executiveEmail: null
    });

    const response = await request(app).get('/api/v1/recommendations');
    expect(response.status).toBe(200);
    expect(response.body.E901).toBeDefined();

    const scopedSql = mockQuery.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('INNER JOIN employees e') && sql.includes('mr.cycle_id = $1'));
    expect(scopedSql).toContain('lower(e.executive_email) = lower($2)');
  });

  it('returns clear eligibility message when employee is excluded by cycle settings', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM employees') && sql.includes('WHERE id = $1') && sql.includes('SELECT 1')) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      if (sql.includes('FROM merit_cycles')) {
        return {
          rows: [{ id: 11, status: 'open', effectiveDate: '2026-01-01', minTenureDays: 365, allowEligibilityOverride: false, enableProration: false, prorationStartDate: null, eligibilityCutoffDate: null }],
          rowCount: 1
        };
      }
      if (sql.includes('SELECT id, salary::float AS salary')) {
        return {
          rows: [{ id: 'E902', salary: 100000, hire_date: '2025-12-01' }],
          rowCount: 1
        };
      }
      if (sql.includes('SELECT * FROM merit_recommendations')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const app = await makeApp({
      email: 'executive@demo.com',
      role: 'executive',
      executiveName: null,
      executiveEmail: null
    });

    const response = await request(app)
      .put('/api/v1/recommendations/E902')
      .send({ meritPct: 3 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('read-only in current workflow state');
  });
});
