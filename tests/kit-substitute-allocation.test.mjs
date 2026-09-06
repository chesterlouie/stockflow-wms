import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('allocation records actual, demanded, kit, and substitute item context',async()=>{
  const [migration,allocation,pick,dispatch,migrate]=await Promise.all([
    readFile(new URL('../database/migrations/043_kit_substitute_allocation.sql',import.meta.url),'utf8'),
    readFile(new URL('../app/api/orders/[id]/allocate/route.ts',import.meta.url),'utf8'),
    readFile(new URL('../app/api/picks/[id]/complete/route.ts',import.meta.url),'utf8'),
    readFile(new URL('../app/api/orders/[id]/dispatch/route.ts',import.meta.url),'utf8'),
    readFile(new URL('../scripts/migrate.mjs',import.meta.url),'utf8'),
  ]);
  assert.match(migration,/allocated_item_id/);
  assert.match(migration,/CREATE VIEW kit_availability/);
  assert.match(allocation,/line\.item_type==='virtual_kit'/);
  assert.match(allocation,/NOT r\.approval_required/);
  assert.match(allocation,/kit_component_substitute/);
  assert.match(allocation,/remaining>0\.000001/);
  assert.match(pick,/picked_quantity=ordered_quantity/);
  assert.match(dispatch,/shipped_quantity=ordered_quantity/);
  assert.match(migrate,/043_kit_substitute_allocation/);
});
