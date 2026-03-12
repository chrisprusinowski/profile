import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../db.js', () => ({
  pool: {
    query: mockQuery
  }
}));

function makeApp(role: 'admin' | 'manager' | 'executive' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      email: `${role}@demo.com`,
      role,
      managerName: null,
      managerEmail: null,
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
      .mockResolvedValueOnce({ rows: [{ planningStatus: 'finalized' }], rowCount: 1 });

    const app = await makeApp('manager');
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E1')
      .send({ meritIncreasePercent: 3 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('plan_locked');
  });

  it('rejects invalid status transition', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ planningStatus: 'not_started' }], rowCount: 1 });

    const app = await makeApp('manager');
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E1/status')
      .send({ status: 'finalized' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('invalid_status_transition');
  });

  it('exports CSV with metadata headers and filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1', importedFirstName: 'Alex' }], rowCount: 1 });

    const app = await makeApp('admin');
    const response = await request(app).get('/api/v1/compensation/cycles/1/total-summary.csv?department=Engineering');

    expect(response.status).toBe(200);
    expect(response.headers['x-export-schema-version']).toBeTruthy();
    expect(response.headers['x-export-filter-summary']).toContain('Engineering');
    expect(response.text).toContain('employeeId,importBatchId,importedFirstName');
  });

  it('returns parity mismatches grouped by employee and field', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1', derivedFinalTotalBonusProrated: 10000 }], rowCount: 1 });

    const app = await makeApp('admin');
    const response = await request(app)
      .post('/api/v1/compensation/cycles/1/parity-review')
      .send({ expected: [{ employeeId: 'E1', fields: { derivedFinalTotalBonusProrated: 9000 } }] });

    expect(response.status).toBe(200);
    expect(response.body.data.mismatchCount).toBe(1);
    expect(response.body.data.mismatches[0]).toMatchObject({ employeeId: 'E1', field: 'derivedFinalTotalBonusProrated' });
  });
});
