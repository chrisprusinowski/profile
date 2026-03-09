import express, { Request, Response, NextFunction } from 'express';
import { checkDatabaseHealth } from './db.js';
import { employeesRouter } from './routes/employees.js';
import { cycleRouter } from './routes/cycle.js';
import { recommendationsRouter } from './routes/recommendations.js';

export const createApp = () => {
  const app = express();

  // ── CORS (allow the Vite dev server and any origin in dev) ─────────────────
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

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json());

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    try {
      const dbConnected = await checkDatabaseHealth();
      return res.status(200).json({ status: 'ok', dbConnected });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ── API v1 routes ──────────────────────────────────────────────────────────
  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/cycle', cycleRouter);
  app.use('/api/v1/recommendations', recommendationsRouter);

  return app;
};
