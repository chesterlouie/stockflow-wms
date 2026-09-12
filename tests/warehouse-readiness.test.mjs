import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const url = process.env.DATABASE_ADMIN_URL;
const migrationsUrl = new URL('../database/migrations/', import.meta.url);

test('latest warehouse migration and operational controls are installed', async (t) => {
  if (!url) return t.skip('DATABASE_ADMIN_URL is required for database readiness verification');
  const latest = (await readdir(migrationsUrl))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort()
    .at(-1)
    .replace(/\.sql$/, '');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const applied = await client.query(
      `SELECT version FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1`,
    );
    assert.equal(applied.rows[0]?.version, latest);
    const tables = [
      'cycle_count_schedules', 'inventory_counts', 'approval_notifications',
      'shipments', 'item_uom_conversions', 'inventory_status_overrides',
      'carrier_tender_attempts', 'carrier_capacity_reservations',
    ];
    const found = (await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name=ANY($1::text[])`,
      [tables],
    )).rows.map((row) => row.table_name);
    assert.deepEqual(new Set(found), new Set(tables));
  } finally {
    await client.end();
  }
});

test('runtime safety flags are explicit', () => {
  assert.ok(process.env.SESSION_SECRET?.length >= 32);
  assert.match(process.env.APP_URL || '', /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$))/);
});
