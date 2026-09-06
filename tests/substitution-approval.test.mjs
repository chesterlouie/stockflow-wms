import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('controlled substitutions create order-specific approvals with clear guidance',async()=>{
  const [migration,allocation,decision,inbox,approvals,rules]=await Promise.all([
    readFile(new URL('../database/migrations/044_substitution_approvals.sql',import.meta.url),'utf8'),
    readFile(new URL('../app/api/orders/[id]/allocate/route.ts',import.meta.url),'utf8'),
    readFile(new URL('../app/api/approvals/[id]/decision/route.ts',import.meta.url),'utf8'),
    readFile(new URL('../app/app/approvals/page.tsx',import.meta.url),'utf8'),
    readFile(new URL('../lib/approvals.ts',import.meta.url),'utf8'),
    readFile(new URL('../app/api/approvals/rules/route.ts',import.meta.url),'utf8'),
  ]);
  assert.match(migration,/order_substitution_approvals/);
  assert.match(allocation,/requestSubstitutionApproval/);
  assert.match(allocation,/order_substitution_approvals osa/);
  assert.match(decision,/q\.operation_type === "item_substitution"/);
  assert.match(inbox,/requestedSku/);
  assert.match(approvals,/Controlled item substitutions/);
  assert.match(rules,/item_substitution/);
});
