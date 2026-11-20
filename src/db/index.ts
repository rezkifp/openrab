import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  openrabPool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured in openrab/.env or environment.');
  }
  return new Pool({ connectionString });
}

export const pool = globalForDb.openrabPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.openrabPool = pool;
}

export const db = drizzle(pool, { schema });
export * from './schema';
