import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('side panel exposes order orchestration and manager operations control', async () => {
  const source = await read('app/app/layout.tsx');
  assert.match(source, /Order orchestration/);
  assert.match(source, /Operations control/);
  assert.match(source, /manager:new Set\([^\n]+\/app\/orders\/operations-control/);
});

test('order landing page summarizes fulfillment before its work queue', async () => {
  const source = await read('app/app/orders/page.tsx');
  for (const label of ['ACTIVE ORDERS','PENDING STORE REQUESTS','BLOCKED ORDERS','OPEN EXCEPTIONS','Fulfillment work queue']) assert.match(source, new RegExp(label));
  assert.match(source, /operational_exceptions/);
  assert.match(source, /replenishment_allocation_jobs/);
});

test('knowledge base and technical handbook explain the navigation model', async () => {
  const [knowledge, handbook] = await Promise.all([read('app/app/help/module-eight.tsx'), read('docs/WAREVANTA-TECHNICAL-HANDBOOK.html')]);
  assert.match(knowledge, /Outbound → Order orchestration/);
  assert.match(handbook, /Order orchestration navigation/);
  assert.match(handbook, /Operations → Operations control/);
});
