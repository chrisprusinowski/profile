import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
loadEnv({ path: resolve(__dirname, '../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.string().default('development')
});

export const env = envSchema.parse(process.env);
