import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('knowledge base explains kits, spare parts, allocation, scanning, and approvals',async()=>{
  const [page,itemGuide,inventory,mobile,outbound,approvals]=await Promise.all([
    readFile(new URL('../app/app/help/page.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/app/help/module-two-item-structures.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/app/help/module-six.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/app/help/module-seven.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/app/help/module-eight.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/app/help/module-twelve.tsx',import.meta.url),'utf8'),
  ]);
  assert.match(page,/ModuleTwoItemStructures/);
  assert.match(itemGuide,/Spare Parts, Kits, and Item Relationships/);
  assert.match(itemGuide,/Virtual kit/);
  assert.match(itemGuide,/Reciprocal substitute/);
  assert.match(inventory,/Buildable now/);
  assert.match(mobile,/actual displayed substitute SKU/);
  assert.match(outbound,/How kits and substitutes allocate/);
  assert.match(approvals,/Controlled item-substitution approval/);
});
