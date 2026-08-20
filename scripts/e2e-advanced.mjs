import assert from "node:assert/strict";
import pg from "pg";
const appUrl = process.env.APP_URL || "https://localhost";
if (new URL(appUrl).hostname === "localhost")
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const admin = new pg.Client({
  connectionString: process.env.DATABASE_ADMIN_URL,
});
await admin.connect();
const stamp = Date.now();
let companyId, userId;
async function post(path, data, cookie) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(data),
    redirect: "manual",
  });
  assert.ok(
    [302, 303, 307, 308].includes(response.status),
    `${path} returned ${response.status}: ${await response.text()}`,
  );
  return response.headers.get("location") || "";
}
try {
  const email = `advanced-${stamp}@warevanta.test`;
  const signup = await fetch(`${appUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      company: `Advanced E2E ${stamp}`,
      email,
      password: "Advanced!Test2026",
    }),
    redirect: "manual",
  });
  assert.equal(signup.status, 303);
  const cookie = signup.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const account = (
    await admin.query(
      `SELECT u.id user_id,m.company_id,w.id warehouse_id FROM users u JOIN company_members m ON m.user_id=u.id JOIN warehouses w ON w.company_id=m.company_id WHERE u.email=$1`,
      [email],
    )
  ).rows[0];
  assert.ok(account);
  companyId = account.company_id;
  userId = account.user_id;
  for (const [code, type] of [
    ["REC-E2E", "receiving"],
    ["STOR-E2E", "storage"],
    ["PICK-E2E", "picking"],
    ["PACK-E2E", "packing"],
    ["HOLD-E2E", "hold"],
    ["DMG-E2E", "damaged"],
  ])
    await post(
      "/api/locations",
      { warehouseId: account.warehouse_id, code, type },
      cookie,
    );
  const locRows = (
    await admin.query(`SELECT code,id FROM locations WHERE company_id=$1`, [
      companyId,
    ])
  ).rows;
  const loc = Object.fromEntries(locRows.map((x) => [x.code, x.id]));
  await post(
    "/api/items",
    {
      sku: "SER-E2E",
      name: "Serialized E2E Item",
      category: "Testing",
      status: "active",
      uom: "EA",
      barcodeMode: "auto",
      barcode: "",
      format: "code128",
      tracking: "serial",
      allocation: "fifo",
    },
    cookie,
  );
  await post(
    "/api/items",
    {
      sku: "LOT-E2E",
      name: "Lot E2E Item",
      category: "Testing",
      status: "active",
      uom: "EA",
      barcodeMode: "auto",
      barcode: "",
      format: "code128",
      tracking: "lot_expiry",
      allocation: "fefo",
    },
    cookie,
  );
  const items = (
    await admin.query(`SELECT id,sku FROM items WHERE company_id=$1`, [
      companyId,
    ])
  ).rows;
  const serialItem = items.find((x) => x.sku === "SER-E2E"),
    lotItem = items.find((x) => x.sku === "LOT-E2E");
  const barcodes = (
    await admin.query(
      `SELECT item_id,barcode_value FROM item_barcodes WHERE company_id=$1 AND is_primary=true`,
      [companyId],
    )
  ).rows;
  const serialBarcode = barcodes.find(
      (x) => x.item_id === serialItem.id,
    ).barcode_value,
    lotBarcode = barcodes.find((x) => x.item_id === lotItem.id).barcode_value;
  const receiptUrl = await post(
    "/api/receiving",
    {
      warehouseId: account.warehouse_id,
      receiptNo: "SER-RCV-E2E",
      supplier: "E2E Supplier",
      externalReference: "E2E-SERIAL",
      expectedDate: "",
      itemId: serialItem.id,
      expectedQuantity: "2",
      uom: "EA",
    },
    cookie,
  );
  const receiptId = receiptUrl.split("/").pop();
  const line = (
    await admin.query(
      `SELECT id FROM inbound_receipt_lines WHERE receipt_id=$1`,
      [receiptId],
    )
  ).rows[0];
  await post(
    `/api/receiving/${receiptId}/inspect`,
    {
      lineId: line.id,
      receivingLocationId: loc["REC-E2E"],
      putawayLocationId: loc["STOR-E2E"],
      holdLocationId: loc["HOLD-E2E"],
      damagedLocationId: loc["DMG-E2E"],
      acceptedQuantity: "2",
      heldQuantity: "0",
      damagedQuantity: "0",
      serialNumbers: "SER-E2E-001\nSER-E2E-002",
    },
    cookie,
  );
  const putaway = (
    await admin.query(`SELECT id FROM putaway_tasks WHERE receipt_line_id=$1`, [
      line.id,
    ])
  ).rows[0];
  const mobileConfirm = await post(
    `/api/putaway/${putaway.id}/mobile-confirm`,
    {
      locationCode: "REC-E2E",
      destinationCode: "STOR-E2E",
      barcode: serialBarcode,
    },
    cookie,
  );
  assert.match(
    mobileConfirm,
    new RegExp(`/api/putaway/${putaway.id}/complete$`),
  );
  await post(`/api/putaway/${putaway.id}/complete`, {}, cookie);
  const stored = (
    await admin.query(
      `SELECT serial_number,status,location_id FROM inventory_serials WHERE company_id=$1 ORDER BY serial_number`,
      [companyId],
    )
  ).rows;
  assert.equal(stored.length, 2);
  assert.ok(
    stored.every(
      (x) => x.status === "available" && x.location_id === loc["STOR-E2E"],
    ),
  );
  const orderUrl = await post(
    "/api/orders",
    {
      warehouseId: account.warehouse_id,
      orderNo: "SER-SO-E2E",
      customer: "E2E Customer",
      requestedShipDate: "",
      priority: "urgent",
      itemId: serialItem.id,
      quantity: "1",
      uom: "EA",
    },
    cookie,
  );
  const orderId = orderUrl.split("/").pop();
  await post(`/api/orders/${orderId}/allocate`, {}, cookie);
  const pick = (
    await admin.query(
      `SELECT p.id,f.code source,d.code destination FROM pick_tasks p JOIN stock_allocations a ON a.id=p.allocation_id JOIN sales_order_lines ol ON ol.id=a.order_line_id JOIN locations f ON f.id=p.from_location_id JOIN locations d ON d.id=p.to_location_id WHERE ol.order_id=$1`,
      [orderId],
    )
  ).rows[0];
  assert.ok(pick);
  await post("/api/cartons", { orderId, cartonNo: "CTN-E2E-001" }, cookie);
  const carton = (
    await admin.query(`SELECT id FROM packing_cartons WHERE order_id=$1`, [
      orderId,
    ])
  ).rows[0];
  await post(
    `/api/picks/${pick.id}/complete`,
    { locationCode: pick.source, barcode: serialBarcode },
    cookie,
  );
  await post(
    `/api/packing/${pick.id}/verify`,
    {
      destinationCode: pick.destination,
      barcode: serialBarcode,
      cartonId: carton.id,
    },
    cookie,
  );
  await post(
    `/api/cartons/${carton.id}/seal`,
    { weightKg: "1.2", lengthCm: "30", widthCm: "20", heightCm: "15" },
    cookie,
  );
  await post(
    `/api/orders/${orderId}/dispatch`,
    { carrier: "E2E Carrier", trackingNumber: "TRACK-E2E" },
    cookie,
  );
  const issued = (
    await admin.query(
      `SELECT status,location_id FROM inventory_serials s JOIN pick_task_serials ps ON ps.serial_id=s.id WHERE ps.pick_task_id=$1`,
      [pick.id],
    )
  ).rows[0];
  assert.equal(issued.status, "issued");
  assert.equal(issued.location_id, null);
  await post(
    "/api/inventory/receive",
    {
      warehouseId: account.warehouse_id,
      locationId: loc["STOR-E2E"],
      itemId: lotItem.id,
      quantity: "20",
      uom: "EA",
      referenceId: "LOT-E2E-RECEIPT",
      lotNumber: "LOT-E2E-01",
      expiryDate: "2027-12-31",
    },
    cookie,
  );
  await post(
    "/api/replenishment/rules",
    {
      itemId: lotItem.id,
      locationId: loc["PICK-E2E"],
      minQuantity: "5",
      targetQuantity: "10",
      maxQuantity: "15",
    },
    cookie,
  );
  await post("/api/replenishment/generate", {}, cookie);
  const replenishment = (
    await admin.query(
      `SELECT t.id,f.code source,d.code destination FROM replenishment_tasks t JOIN locations f ON f.id=t.from_location_id JOIN locations d ON d.id=t.to_location_id WHERE t.company_id=$1 AND t.item_id=$2 AND t.status='pending'`,
      [companyId, lotItem.id],
    )
  ).rows[0];
  assert.ok(replenishment);
  await post(
    `/api/replenishment/${replenishment.id}/complete`,
    {
      locationCode: replenishment.source,
      destinationCode: replenishment.destination,
      barcode: lotBarcode,
    },
    cookie,
  );
  assert.equal(
    (
      await admin.query(`SELECT status FROM replenishment_tasks WHERE id=$1`, [
        replenishment.id,
      ])
    ).rows[0].status,
    "completed",
  );
  await post(
    "/api/returns",
    {
      returnNo: "RTN-E2E",
      returnType: "customer",
      warehouseId: account.warehouse_id,
      partyName: "E2E Customer",
      reason: "Unopened return",
      itemId: lotItem.id,
      quantity: "2",
      uom: "EA",
      barcode: lotBarcode,
      quarantineLocationId: loc["HOLD-E2E"],
      sourceLocationId: "",
      lotNumber: "LOT-E2E-01",
      expiryDate: "2027-12-31",
    },
    cookie,
  );
  const ret = (
    await admin.query(
      `SELECT id FROM inventory_returns WHERE company_id=$1 AND return_no='RTN-E2E'`,
      [companyId],
    )
  ).rows[0];
  await post(
    `/api/returns/${ret.id}/disposition`,
    { disposition: "restock", destinationLocationId: loc["STOR-E2E"] },
    cookie,
  );
  assert.equal(
    (
      await admin.query(`SELECT status FROM inventory_returns WHERE id=$1`, [
        ret.id,
      ])
    ).rows[0].status,
    "restocked",
  );
  await post('/api/approvals/rules',{name:'E2E adjustment approval',operationType:'inventory_adjustment',thresholdQuantity:'1',requiredSteps:'1',step1Role:'owner',step2Role:'owner',escalationHours:'24'},cookie);
  const adjustmentReference=`ADJ-E2E-${stamp}`;
  const approvalLocation=await post('/api/inventory/adjust',{itemId:lotItem.id,locationId:loc['STOR-E2E'],quantity:'3',uom:'EA',reasonCode:'CORRECTION',referenceId:adjustmentReference,lotNumber:'LOT-E2E-01',expiryDate:'2027-12-31',note:'Advanced QA approval'},cookie);
  assert.match(approvalLocation,/\/app\/approvals/);
  const approval=(await admin.query(`SELECT id,status FROM approval_requests WHERE company_id=$1 AND entity_id=$2`,[companyId,adjustmentReference])).rows[0];assert.equal(approval.status,'pending');
  await post(`/api/approvals/${approval.id}/decision`,{decision:'approved',comment:'QA approved'},cookie);
  assert.equal((await admin.query(`SELECT status FROM approval_requests WHERE id=$1`,[approval.id])).rows[0].status,'executed');
  assert.equal(Number((await admin.query(`SELECT quantity FROM inventory_ledger WHERE company_id=$1 AND reference_id=$2`,[companyId,adjustmentReference])).rows[0].quantity),3);
  const countNo=`CC-E2E-${stamp}`;const countLocation=await post('/api/counts',{warehouseId:account.warehouse_id,countNo,countType:'cycle',locationId:loc['STOR-E2E'],blindCount:'on'},cookie);const countId=countLocation.split('/').pop();
  const countLines=(await admin.query(`SELECT cl.id,cl.system_quantity::text,l.code,b.barcode_value FROM inventory_count_lines cl JOIN locations l ON l.id=cl.location_id JOIN item_barcodes b ON b.company_id=cl.company_id AND b.item_id=cl.item_id AND b.is_primary=true WHERE cl.count_id=$1 ORDER BY cl.id`,[countId])).rows;assert.ok(countLines.length);
  for(let index=0;index<countLines.length;index++){const line=countLines[index];await post(`/api/counts/lines/${line.id}/submit`,{locationCode:line.code,barcode:line.barcode_value,countedQuantity:String(Number(line.system_quantity)+(index===0?2:0))},cookie)}
  assert.equal((await admin.query(`SELECT status FROM inventory_counts WHERE id=$1`,[countId])).rows[0].status,'counted');await post(`/api/counts/${countId}/recount`,{},cookie);const recount=(await admin.query(`SELECT id,status FROM inventory_counts WHERE parent_count_id=$1`,[countId])).rows[0];assert.ok(recount);assert.equal((await admin.query(`SELECT status FROM inventory_counts WHERE id=$1`,[countId])).rows[0].status,'cancelled');
  const recountLines=(await admin.query(`SELECT cl.id,cl.system_quantity::text,l.code,b.barcode_value FROM inventory_count_lines cl JOIN locations l ON l.id=cl.location_id JOIN item_barcodes b ON b.company_id=cl.company_id AND b.item_id=cl.item_id AND b.is_primary=true WHERE cl.count_id=$1`,[recount.id])).rows;assert.equal(recountLines.length,1);for(const line of recountLines)await post(`/api/counts/lines/${line.id}/submit`,{locationCode:line.code,barcode:line.barcode_value,countedQuantity:line.system_quantity},cookie);await post(`/api/counts/${recount.id}/approve`,{},cookie);assert.equal((await admin.query(`SELECT status FROM inventory_counts WHERE id=$1`,[recount.id])).rows[0].status,'approved');
  await post(`/api/items/${lotItem.id}/cost`,{standardCost:'12.50',currency:'PHP'},cookie);const valuation=await fetch(`${appUrl}/api/reports/export?type=valuation`,{headers:{cookie}});assert.equal(valuation.status,200);const valuationCsv=await valuation.text();assert.match(valuationCsv,/inventory_value/i);assert.match(valuationCsv,/LOT-E2E/);
  const pdf = await fetch(
    `${appUrl}/api/reports/export?type=fulfillment&format=pdf`,
    { headers: { cookie } },
  );
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") || "", /application\/pdf/);
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), "%PDF-1.4");
  assert.ok(bytes.length > 500);
  const runCount = (
    await admin.query(
      `SELECT count(*)::int n FROM report_runs WHERE company_id=$1`,
      [companyId],
    )
  ).rows[0].n;
  assert.equal(runCount, 0);
  console.log(
    "Advanced E2E passed: receiving, serial lifecycle, putaway, pick-pack-dispatch, replenishment, returns, approvals, recounts, valuation, PDF export, and safe report worker.",
  );
} finally {
  if (companyId)
    await admin.query("DELETE FROM companies WHERE id=$1", [companyId]);
  if (userId) await admin.query("DELETE FROM users WHERE id=$1", [userId]);
  await admin.end();
}
