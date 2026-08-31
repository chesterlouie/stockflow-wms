import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('Starter plan consistently allows six users',async()=>{
  const billing=await readFile(new URL('../lib/billing.ts',import.meta.url),'utf8');
  const guidance=await readFile(new URL('../app/app/help/module-fifteen.tsx',import.meta.url),'utf8');
  const migration=await readFile(new URL('../database/migrations/041_starter_six_user_limit.sql',import.meta.url),'utf8');
  assert.match(billing,/starter:[^\n]+users:\s*6/);
  assert.match(guidance,/Up to 6 users/);
  assert.match(migration,/DEFAULT 6/);
  assert.match(migration,/subscription_plan = 'starter'/);
  assert.match(migration,/max_users = 3/);
});
