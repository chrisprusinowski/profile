import express from 'express';
import { healthSchema } from '@profile/shared';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.get('/health', (_req, res) => {
  res.json(healthSchema.parse({ status: 'ok' }));
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
