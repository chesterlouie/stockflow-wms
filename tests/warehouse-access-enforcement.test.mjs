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

test('receiving and putaway queues hide other warehouses and mutation routes guard direct ids',async()=>{
  const filteredPages=['app/app/receiving/page.tsx','app/app/receiving/mobile/page.tsx','app/app/receiving/mobile/[id]/page.tsx','app/app/putaway/mobile/page.tsx','app/app/receiving/[id]/label/page.tsx'];
  for(const path of filteredPages)assert.match(await read(path),/user_warehouse_assignments/,`${path} must filter warehouse visibility`);
  const guardedRoutes=['app/api/receiving/[id]/inspect/route.ts','app/api/receiving/[id]/mobile-inspect/route.ts','app/api/putaway/[id]/complete/route.ts','app/api/putaway/[id]/mobile-confirm/route.ts'];
  for(const path of guardedRoutes)assert.match(await read(path),/(assertWarehouseAccess|user_warehouse_assignments)/,`${path} must guard direct task ids`);
});

test('receipt inspection locations are limited to the receipt warehouse',async()=>{
  const source=await read('app/api/receiving/[id]/inspect/route.ts');
  assert.match(source,/warehouse_id=\$2 AND id=ANY\(\$3::uuid\[\]\)/);
});

test('outbound mutations guard warehouse-scoped orders, picks, cartons, and shipments',async()=>{
  const guardedRoutes=[
    'app/api/orders/[id]/allocate/route.ts',
    'app/api/picks/[id]/complete/route.ts',
    'app/api/picks/[id]/exception/route.ts',
    'app/api/packing/[id]/verify/route.ts',
    'app/api/cartons/route.ts',
    'app/api/cartons/[id]/seal/route.ts',
    'app/api/orders/[id]/dispatch/route.ts',
    'app/api/shipments/[id]/reverse/route.ts'
  ];
  for(const path of guardedRoutes)assert.match(await read(path),/assert(?:Warehouse|Order|Pick|Carton|Shipment)Access/,`${path} must guard warehouse access`);
});

test('direct outbound order and label URLs hide inaccessible warehouse records',async()=>{
  const layouts=['app/app/orders/[id]/layout.tsx','app/app/cartons/[id]/layout.tsx','app/app/shipments/[id]/layout.tsx'];
  for(const path of layouts){
    const source=await read(path);
    assert.match(source,/user_warehouse_assignments/);
    assert.match(source,/notFound/);
  }
});
