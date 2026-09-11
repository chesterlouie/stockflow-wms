import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('warehouse setup provides tenant-safe individual and bulk location labels',async()=>{
 const [setup,one,bulk,six,seven]=await Promise.all([
  readFile(new URL('../app/app/setup/page.tsx',import.meta.url),'utf8'),readFile(new URL('../app/app/setup/locations/[id]/label/page.tsx',import.meta.url),'utf8'),readFile(new URL('../app/app/setup/locations/labels/page.tsx',import.meta.url),'utf8'),readFile(new URL('../app/app/help/module-six.tsx',import.meta.url),'utf8'),readFile(new URL('../app/app/help/module-seven.tsx',import.meta.url),'utf8')]);
 assert.match(setup,/Print all locations/);assert.match(setup,/Print label/);
 assert.match(one,/l\.company_id=\$1 AND l\.id=\$2/);assert.match(one,/qrcode/);assert.match(one,/code128/);
 assert.match(bulk,/l\.company_id=\$1 AND l\.warehouse_id=\$2/);assert.match(bulk,/l\.active=true/);
 assert.match(six,/Location label printing — exact steps/);assert.match(six,/Update preview/);assert.match(six,/100% scale/);assert.match(seven,/open Chapter 6/);
});
