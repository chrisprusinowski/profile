import express, { Request, Response, NextFunction } from 'express';
import { checkDatabaseHealth } from './db.js';
import { employeesRouter } from './routes/employees.js';
import { cycleRouter } from './routes/cycle.js';
import { recommendationsRouter } from './routes/recommendations.js';

export const createApp = () => {
  const app = express();

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    } catch (error) {
      return res.status(503).json({
        status: 'error',
        message: 'Database connection failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/cycle', cycleRouter);
  app.use('/api/v1/recommendations', recommendationsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    console.error('[api] Unhandled route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  return app;
};
