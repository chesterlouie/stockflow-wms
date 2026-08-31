import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const protectedRoutes = [
  ["app/api/reports/settings/route.ts", ["owner", "admin", "manager"]],
  ["app/api/reports/schedules/route.ts", ["owner", "admin", "manager"]],
  ["app/api/reports/runs/[id]/retry/route.ts", ["owner", "admin", "manager"]],
  ["app/api/waves/route.ts", ["owner", "admin", "manager"]],
  ["app/api/returns/[id]/disposition/route.ts", ["owner", "admin", "manager"]],
  ["app/api/returns/[id]/reverse/route.ts", ["owner", "admin"]],
  ["app/api/exceptions/[id]/resolve/route.ts", ["owner", "admin", "manager"]],
  ["app/api/orders/[id]/control/route.ts", ["owner", "admin", "manager"]],
  [
    "app/api/picks/[id]/exception/route.ts",
    ["owner", "admin", "manager", "operator"],
  ],
  ["app/api/cartons/route.ts", ["owner", "admin", "manager", "operator"]],
  [
    "app/api/cartons/[id]/seal/route.ts",
    ["owner", "admin", "manager", "operator"],
  ],
  ["app/api/manifests/route.ts", ["owner", "admin", "manager"]],
  ["app/api/manifests/[id]/close/route.ts", ["owner", "admin", "manager"]],
  ["app/api/docks/route.ts", ["owner", "admin", "manager"]],
  ["app/api/appointments/route.ts", ["owner", "admin", "manager"]],
  [
    "app/api/appointments/[id]/status/route.ts",
    ["owner", "admin", "manager", "operator"],
  ],
  ["app/api/users/[id]/role/route.ts", ["owner", "admin"]],
  ["app/api/approvals/rules/route.ts", ["owner", "admin"]],
  ["app/api/approvals/rules/[id]/route.ts", ["owner", "admin"]],
  ["app/api/approvals/delegations/route.ts", ["owner", "admin", "manager"]],
  ["app/api/shipments/[id]/reverse/route.ts", ["owner", "admin"]],
  ["app/api/counts/classify/route.ts", ["owner", "admin", "manager"]],
  ["app/api/counts/schedules/route.ts", ["owner", "admin", "manager"]],
  ["app/api/counts/[id]/recount/route.ts", ["owner", "admin", "manager"]],
  ["app/api/items/[id]/cost/route.ts", ["owner", "admin", "manager"]],
  ["app/api/items/[id]/uom/route.ts", ["owner", "admin", "manager"]],
  ["app/api/items/route.ts", ["owner", "admin", "manager"]],
  ["app/api/items/[id]/barcodes/route.ts", ["owner", "admin", "manager"]],
  ["app/api/suppliers/route.ts", ["owner", "admin", "manager"]],
  ["app/api/suppliers/[id]/status/route.ts", ["owner", "admin", "manager"]],
  ["app/api/inventory/status/route.ts", ["owner", "admin", "manager"]],
];
for (const [path, roles] of protectedRoutes)
  test(`${path} enforces its management roles`, async () => {
    const source = await readFile(
      new URL(`../${path}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /status\s*:\s*403/);
    for (const role of roles)
      assert.match(source, new RegExp(`['"]${role}['"]`));
    assert.match(source, /getSession/);
  });
test("tenant database helper always opens a transaction and sets company context", async () => {
  const source = await readFile(
    new URL("../lib/db.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /BEGIN/);
  assert.match(source, /set_config\('app\.company_id'/);
  assert.match(source, /COMMIT/);
  assert.match(source, /ROLLBACK/);
});

test("company roles receive matching navigation and direct-request controls", async () => {
  const layout = await readFile(new URL("../app/app/layout.tsx", import.meta.url), "utf8");
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  for (const role of ["manager", "operator", "viewer"])
    assert.match(layout, new RegExp(`${role}:new Set`));
  for (const route of ["/app/receiving", "/app/inventory", "/app/fulfillment/mobile", "/app/packing/cartons", "/app/dispatch/mobile"])
    assert.match(layout, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(proxy, /role==='manager'/);
  assert.match(proxy, /role==='operator'/);
  assert.match(proxy, /role==='viewer'/);
  assert.match(proxy, /\/app\/restricted/);
  assert.match(proxy, /status:403/);
  assert.match(proxy, /\/api\/inventory\/transfer/);
  assert.ok(proxy.includes("/^\\/api\\/orders\\/[^/]+\\/dispatch$/"));
  assert.match(proxy, /operatorPages\.includes\(pathname\)/);
  assert.match(proxy, /'\/app\/receiving'/);
  assert.match(proxy, /\/app\/inventory\/transfer/);
  assert.doesNotMatch(proxy, /operatorPagePrefixes=\[[^\]]*inventory/);
  assert.match(proxy, /viewerPersonalMutation/);
  assert.match(proxy, /managerRestrictedMutation/);
  for (const route of ["/api/billing", "/api/integrations", "/api/users", "/api/invitations", "/api/warehouses"])
    assert.match(proxy, new RegExp(route.replaceAll("/", "\\/")));
});
