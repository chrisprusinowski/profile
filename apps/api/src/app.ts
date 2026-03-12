import express, { Request, Response, NextFunction } from 'express';
import { checkDatabaseHealth } from './db.js';
import { employeesRouter } from './routes/employees.js';
import { cycleRouter } from './routes/cycle.js';
import { recommendationsRouter } from './routes/recommendations.js';
import { usersRouter } from './routes/users.js';
import { payRangesRouter } from './routes/payRanges.js';
import { exportsRouter } from './routes/exports.js';
import { compensationCyclesRouter } from './routes/compensationCycles.js';
import { authMiddleware } from './auth.js';
import { handleApiError } from './errors.js';

export const createApp = () => {
  const app = express();

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Demo-User-Email');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      const dbConnected = await checkDatabaseHealth();
      return res.status(200).json({ status: 'ok', dbConnected });
    } catch {
      return res.status(503).json({
        status: 'error',
        message: 'Database connection failed',
      });
    }
  });

  app.use(authMiddleware);

  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/cycle', cycleRouter);
  app.use('/api/v1/recommendations', recommendationsRouter);
  app.use('/api/v1/pay-ranges', payRangesRouter);
  app.use('/api/v1/exports', exportsRouter);
  app.use('/api/v1/compensation', compensationCyclesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    handleApiError(error, _req, res);
  });

  return app;
};
