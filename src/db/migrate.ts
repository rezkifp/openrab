import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';

async function main() {
  if (!pool) {
    throw new Error('pg pool is not initialized (embedded mode does not use pg.Pool)');
  }
  const client = await pool.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS "openrab";');
  } finally {
    client.release();
  }

  await migrate(db, {
    migrationsFolder: './drizzle',
    migrationsSchema: 'openrab',
    migrationsTable: '__openrab_migrations',
  });

  const verify = await pool.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_schema = 'openrab'
     ORDER BY table_name;`
  );

  console.log('OpenRAB schema tables verified:');
  for (const row of verify.rows) {
    console.log(` - ${row.table_schema}.${row.table_name}`);
  }
}

main()
  .then(async () => {
    await pool?.end();
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await pool?.end();
    process.exit(1);
  });
