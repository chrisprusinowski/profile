import { Pool } from 'pg';
import { env } from './config.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export const checkDatabaseHealth = async (): Promise<boolean> => {
  const result = await pool.query('SELECT 1 as connected');
  return result.rows[0]?.connected === 1;
};
