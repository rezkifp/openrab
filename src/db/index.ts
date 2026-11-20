import 'dotenv/config';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import * as schema from './schema';

const useEmbedded =
  process.env.OPENRAB_EMBEDDED_DB === 'true' || !process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as {
  openrabPool?: Pool;
  openrabPglite?: PGlite;
  openrabInitPromise?: Promise<void>;
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

const pgliteDb = useEmbedded
  ? drizzlePglite(pgliteClient!, { schema })
  : undefined;

export const db: NodePgDatabase<typeof schema> = useEmbedded
  ? (pgliteDb as unknown as NodePgDatabase<typeof schema>)
  : drizzlePg(pool!, { schema });

export async function ensureDbReady(): Promise<void> {
  if (!useEmbedded || !pgliteClient || !pgliteDb) return;
  if (!globalForDb.openrabInitPromise) {
    globalForDb.openrabInitPromise = (async () => {
      await pgliteClient.exec('CREATE SCHEMA IF NOT EXISTS "openrab";');
      await migratePglite(pgliteDb, {
        migrationsFolder: path.join(process.cwd(), 'drizzle'),
        migrationsSchema: 'openrab',
        migrationsTable: '__openrab_migrations',
      });
      const existingRegions = await db.select().from(schema.regions).limit(1);
      if (existingRegions.length === 0) {
        await db.insert(schema.regions).values({
          name: 'DKI Jakarta & Sekitarnya (2026)',
        });
      }
    })();
  }
  await globalForDb.openrabInitPromise;
}

export * from './schema';
