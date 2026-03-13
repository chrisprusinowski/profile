import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../db.js', () => ({
  pool: {
    query: mockQuery
  }
}));

function makeApp(options?: {
  role?: 'admin' | 'manager' | 'executive';
  managerName?: string | null;
  managerEmail?: string | null;
}) {
  const role = options?.role ?? 'admin';
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      email: `${role}@demo.com`,
      role,
      managerName: options?.managerName ?? null,
      managerEmail: options?.managerEmail ?? null,
      isActive: true
    };
    next();
  });

  return import('./compensationCycles.js').then(({ compensationCyclesRouter }) => {
    app.use('/api/v1/compensation', compensationCyclesRouter);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
    return app;
  });
}

describe('compensationCycles router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('locks finalized plan edits without admin override', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ planningStatus: 'finalized' }], rowCount: 1 });

    const app = await makeApp({ role: 'manager', managerName: 'Mgr One' });
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E1')
      .send({ meritIncreasePercent: 3 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('plan_locked');
  });

  it('allows admin override edits on finalized rows', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ planningStatus: 'finalized' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ planningStatus: 'finalized' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ planning_status: 'finalized' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const app = await makeApp({ role: 'admin' });
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E1?adminOverride=true')
      .send({ meritIncreasePercent: 4.5 });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeTruthy();
  });

  it('rejects invalid status transition', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ planningStatus: 'not_started' }], rowCount: 1 });

    const app = await makeApp({ role: 'manager', managerName: 'Mgr One' });
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E1/status')
      .send({ status: 'finalized' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('invalid_status_transition');
  });

  it('enforces admin-only finalization', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ planningStatus: 'exec_reviewed' }], rowCount: 1 });

    const app = await makeApp({ role: 'executive' });
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E1/status')
      .send({ status: 'finalized' });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('Only admin can finalize');
  });

  it('filters plan reads to manager scope', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const app = await makeApp({ role: 'manager', managerName: 'Jamie Rivera', managerEmail: 'manager1@demo.com' });
    await request(app).get('/api/v1/compensation/cycles/1/plans');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('lower(e.manager) = lower($2)');
    expect(sql).toContain('lower(e.manager_email) = lower($3)');
    expect(params).toEqual([1, 'Jamie Rivera', 'manager1@demo.com']);
  });

  it('blocks manager write outside scope', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const app = await makeApp({ role: 'manager', managerName: 'Jamie Rivera', managerEmail: 'manager1@demo.com' });
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E9')
      .send({ meritIncreasePercent: 3 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_found');
  });

  it('returns structured total-summary export payload', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1', importedFirstName: 'Alex' }], rowCount: 1 });

    const app = await makeApp({ role: 'admin' });
    const response = await request(app).get('/api/v1/compensation/cycles/1/total-summary.export?department=Engineering');

    expect(response.status).toBe(200);
    expect(response.body.data.schemaVersion).toBeTruthy();
    expect(response.body.data.filters.department).toBe('Engineering');
    expect(response.body.data.rowCount).toBe(1);
    expect(response.body.data.rows[0].employeeId).toBe('E1');
  });

  it('returns parity mismatches grouped by employee and field', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1', derivedFinalTotalBonusProrated: 10000 }], rowCount: 1 });

    const app = await makeApp({ role: 'admin' });
    const response = await request(app)
      .post('/api/v1/compensation/cycles/1/parity-review')
      .send({ expected: [{ employeeId: 'E1', fields: { derivedFinalTotalBonusProrated: 9000 } }] });

    expect(response.status).toBe(200);
    expect(response.body.data.mismatchCount).toBe(1);
    expect(response.body.data.mismatchesByEmployee.E1[0]).toMatchObject({ field: 'derivedFinalTotalBonusProrated' });
    expect(response.body.data.mismatchesByField.derivedFinalTotalBonusProrated).toBe(1);
  });
});
