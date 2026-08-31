import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {matchesItemIdentifier} from '../lib/barcode-match.ts';

test('item confirmation accepts primary EA, pack CASE, and exact SKU identifiers',()=>{
  const barcodes=['00000001','00000002'];
  assert.equal(matchesItemIdentifier('00000001','TRAIN-COLA-330',barcodes),true);
  assert.equal(matchesItemIdentifier('00000002','TRAIN-COLA-330',barcodes),true);
  assert.equal(matchesItemIdentifier('TRAIN-COLA-330','TRAIN-COLA-330',barcodes),true);
  assert.equal(matchesItemIdentifier('\u200b00000001\r\n','TRAIN-COLA-330',barcodes),true);
  assert.equal(matchesItemIdentifier('00000003','TRAIN-COLA-330',barcodes),false);
});

test('mobile receiving accepts registered barcodes or exact SKU and stays in mobile flow',async()=>{
  const route=await readFile(new URL('../app/api/receiving/[id]/mobile-inspect/route.ts',import.meta.url),'utf8');
  const task=await readFile(new URL('../app/app/receiving/mobile/[id]/page.tsx',import.meta.url),'utf8');
  const queue=await readFile(new URL('../app/app/receiving/mobile/page.tsx',import.meta.url),'utf8');
  const knowledge=await readFile(new URL('../app/app/help/module-five.tsx',import.meta.url),'utf8');
  const proxy=await readFile(new URL('../proxy.ts',import.meta.url),'utf8');
  assert.match(route,/array_agg\(barcode\.barcode_value/);
  assert.match(route,/matchesItemIdentifier/);
  assert.match(route,/inspectReceipt/);
  assert.match(route,/\/app\/receiving\/mobile\?received=1/);
  assert.match(task,/Confirm item barcode or SKU/);
  assert.match(task,/error==='barcode'/);
  assert.match(task,/error==='shelf_life'/);
  assert.match(queue,/Receipt posted successfully/);
  assert.match(proxy,/operatorMutationPrefixes=[\s\S]*'\/api\/receiving'/);
  assert.match(knowledge,/exact SKU/);
  assert.match(knowledge,/signing in from another device does not require manager approval/);
});
