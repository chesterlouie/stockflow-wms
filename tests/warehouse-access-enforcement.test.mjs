import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('warehouse mutations call the shared assignment guard',async()=>{
  const paths=['app/api/inventory/receive/route.ts','app/api/purchase-orders/route.ts','app/api/orders/route.ts','app/api/receiving/route.ts','app/api/waves/route.ts','lib/inventory.ts'];
  for(const path of paths){
    const source=await read(path);
    assert.match(source,/assertWarehouseAccess/ ,`${path} must enforce warehouse assignment`);
  }
});

test('warehouse guard grants owners and checks assignments for other roles',async()=>{
  const source=await read('lib/warehouse-access.ts');
  assert.match(source,/session\.role==='owner'/);
  assert.match(source,/user_warehouse_assignments/);
  assert.match(source,/WAREHOUSE_ACCESS/);
});

test('dashboard uses the real active warehouse column',async()=>{
  const source=await read('app/app/dashboard/page.tsx');
  assert.match(source,/w\.active=true/);
  assert.doesNotMatch(source,/w\.is_active/);
});
