import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.string().default('development')
});

export const env = envSchema.parse(process.env);
