import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../db.js', () => ({
  pool: {
    query: mockQuery
  }
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      email: 'admin@demo.com',
      role: 'admin',
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

  it('creates cycles', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'FY27 Planning', cycleType: 'annual' }],
      rowCount: 1
    });

    const app = await makeApp();
    const response = await request(app)
      .post('/api/v1/compensation/cycles')
      .send({ name: 'FY27 Planning', cycleType: 'annual' });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(1);
  });

  it('saves cycle plans using one employee/cycle upsert', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cycle_id: 1, employee_id: 'E1' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            employeeId: 'E1',
            salary: 100000,
            rangeMid: 100000,
            bonusTargetPercent: 10,
            meritIncreaseAmount: 5000,
            meritIncreasePercent: null,
            recommendedMeritAmount: 4000,
            recommendedMeritPercent: null,
            promotionIncreaseAmount: 0,
            bonusOverrideAmount: null,
            bonusOverridePercent: null,
            bonusWeightCompany: 0.5,
            bonusWeightIndividual: 0.5,
            goalAttainmentCompany: 100,
            goalAttainmentIndividual: 100,
            plannerVariance: null,
            newRangeMid: 100000
          }
        ],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const app = await makeApp();
    const response = await request(app)
      .put('/api/v1/compensation/cycles/1/plans/E1')
      .send({
        meritIncreaseAmount: 5000,
        recommendedMeritAmount: 4000
      });

    expect(response.status).toBe(200);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('ON CONFLICT (cycle_id, employee_id)');
  });

  it('retrieves merged total-summary rows', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1', importedSalary: 100000, derivedCompaRatio: 1 }], rowCount: 1 });

    const app = await makeApp();
    const response = await request(app).get('/api/v1/compensation/cycles/1/total-summary');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ employeeId: 'E1', importedSalary: 100000, derivedCompaRatio: 1 });
  });

  it('regenerates outputs deterministically when called repeatedly', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            employeeId: 'E1',
            salary: null,
            rangeMid: 100000,
            bonusTargetPercent: 10,
            meritIncreaseAmount: null,
            meritIncreasePercent: null,
            recommendedMeritAmount: null,
            recommendedMeritPercent: null,
            promotionIncreaseAmount: null,
            bonusOverrideAmount: null,
            bonusOverridePercent: null,
            bonusWeightCompany: null,
            bonusWeightIndividual: null,
            goalAttainmentCompany: null,
            goalAttainmentIndividual: null,
            plannerVariance: null,
            newRangeMid: 100000
          }
        ],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1', gapFlags: ['missing_salary'] }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            employeeId: 'E1',
            salary: null,
            rangeMid: 100000,
            bonusTargetPercent: 10,
            meritIncreaseAmount: null,
            meritIncreasePercent: null,
            recommendedMeritAmount: null,
            recommendedMeritPercent: null,
            promotionIncreaseAmount: null,
            bonusOverrideAmount: null,
            bonusOverridePercent: null,
            bonusWeightCompany: null,
            bonusWeightIndividual: null,
            goalAttainmentCompany: null,
            goalAttainmentIndividual: null,
            plannerVariance: null,
            newRangeMid: 100000
          }
        ],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ employeeId: 'E1', gapFlags: ['missing_salary'] }], rowCount: 1 });

    const app = await makeApp();
    const first = await request(app).get('/api/v1/compensation/cycles/1/outputs');
    const second = await request(app).get('/api/v1/compensation/cycles/1/outputs');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const outputUpserts = mockQuery.mock.calls.filter((call) => String(call[0]).includes('INSERT INTO employee_comp_outputs'));
    expect(outputUpserts).toHaveLength(2);
    expect(first.body.data[0].gapFlags).toContain('missing_salary');
    expect(second.body.data[0].gapFlags).toContain('missing_salary');
  });
});
