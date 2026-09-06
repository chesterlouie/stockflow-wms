import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('kit and item relationship foundation is tenant-safe and managed in Item Master',async()=>{
  const migration=await readFile(new URL('../database/migrations/042_item_kits_and_relationships.sql',import.meta.url),'utf8');
  const migrator=await readFile(new URL('../scripts/migrate.mjs',import.meta.url),'utf8');
  const detail=await readFile(new URL('../app/app/items/[id]/page.tsx',import.meta.url),'utf8');
  const relationships=await readFile(new URL('../app/api/items/[id]/relationships/route.ts',import.meta.url),'utf8');
  assert.match(migration,/virtual_kit/);
  assert.match(migration,/stocked_kit/);
  assert.match(migration,/reciprocal_substitute/);
  assert.match(migration,/superseded_by/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(migrator,/042_item_kits_and_relationships/);
  assert.match(detail,/Kit components/);
  assert.match(detail,/Item relationships/);
  assert.match(relationships,/relationshipType==='reciprocal_substitute'/);
  assert.match(relationships,/\['owner','admin','manager'\]/);
});
