import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  API_BASE_URL: z.string().url().default('http://api:4000')
});

export const env = envSchema.parse(process.env);
