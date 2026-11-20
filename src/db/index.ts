import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import * as schema from './schema';

const useEmbedded =
  process.env.OPENRAB_EMBEDDED_DB === 'true' || !process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as {
  openrabPool?: Pool;
  openrabPglite?: PGlite;
};

function createPgPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured in openrab/.env or environment.');
  }
  return new Pool({ connectionString });
}

function createPgliteClient(): PGlite {
  const dataDir = process.env.OPENRAB_DATA_DIR || './.openrab-data';
  return new PGlite(dataDir);
}

export const pool = useEmbedded
  ? undefined
  : (globalForDb.openrabPool ?? createPgPool());

const pgliteClient = useEmbedded
  ? (globalForDb.openrabPglite ?? createPgliteClient())
  : undefined;

if (process.env.NODE_ENV !== 'production') {
  if (pool) globalForDb.openrabPool = pool;
  if (pgliteClient) globalForDb.openrabPglite = pgliteClient;
}

export const db: NodePgDatabase<typeof schema> = useEmbedded
  ? (drizzlePglite(pgliteClient!, { schema }) as unknown as NodePgDatabase<typeof schema>)
  : drizzlePg(pool!, { schema });

export * from './schema';
