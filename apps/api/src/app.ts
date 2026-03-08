import express from 'express';
import { checkDatabaseHealth } from './db.js';

export const createApp = () => {
  const app = express();

  app.get('/health', async (_req, res) => {
    try {
      const dbConnected = await checkDatabaseHealth();
      return res.status(200).json({
        status: 'ok',
        dbConnected
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return app;
};
