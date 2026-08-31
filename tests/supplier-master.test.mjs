import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('supplier maintenance is controlled through Master Data',async()=>{
  const layout=await readFile(new URL('../app/app/layout.tsx',import.meta.url),'utf8');
  const purchasing=await readFile(new URL('../app/app/purchasing/page.tsx',import.meta.url),'utf8');
  const supplierPage=await readFile(new URL('../app/app/suppliers/page.tsx',import.meta.url),'utf8');
  const importer=await readFile(new URL('../app/api/imports/purchase-orders/route.ts',import.meta.url),'utf8');
  assert.match(layout,/Master data[^\n]+\/app\/suppliers/);
  assert.match(supplierPage,/Supplier master/);
  assert.match(supplierPage,/\/api\/suppliers\/\$\{supplier\.id\}\/status/);
  assert.doesNotMatch(purchasing,/action="\/api\/suppliers"/);
  assert.match(purchasing,/href="\/app\/suppliers"/);
  assert.match(importer,/SELECT id FROM suppliers/);
  assert.match(importer,/status='active'/);
  assert.doesNotMatch(importer,/INSERT INTO suppliers/);
});
