import express from 'express';
import { env } from './config.js';

export const createApp = () => {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/', (_req, res) => {
    res.status(200).send(`<!doctype html>
<html>
  <head><title>Web App</title></head>
  <body>
    <h1>Web App</h1>
    <p>API endpoint: ${env.API_BASE_URL}</p>
  </body>
</html>`);
  });

  return app;
};
