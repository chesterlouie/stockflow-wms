import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

test('synchronizes PO progress from receiving', async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();
  await client.query('BEGIN');
  try {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const company = (await client.query(
      `INSERT INTO companies(name,slug) VALUES('Purchasing QA',$1) RETURNING id`,
      [`purchasing-qa-${stamp}`],
    )).rows[0];
    await client.query(`SELECT set_config('app.company_id',$1,true)`, [company.id]);
    const warehouse = (await client.query(
      `INSERT INTO warehouses(company_id,code,name) VALUES($1,'QA','Purchasing QA Warehouse') RETURNING id`,
      [company.id],
    )).rows[0];
    const item = (await client.query(
      `INSERT INTO items(company_id,sku,description,base_uom) VALUES($1,$2,'Purchasing QA Item','EA') RETURNING id`,
      [company.id, `QA-PO-${stamp}`],
    )).rows[0];
    const supplier = (await client.query(
      `INSERT INTO suppliers(company_id,code,name) VALUES($1,$2,'Purchasing QA Supplier') RETURNING id`,
      [company.id, `QA-${stamp}`],
    )).rows[0];
    const purchaseOrder = (await client.query(
      `INSERT INTO purchase_orders(company_id,warehouse_id,supplier_id,po_no) VALUES($1,$2,$3,$4) RETURNING id`,
      [company.id, warehouse.id, supplier.id, `QA-PO-${stamp}`],
    )).rows[0];
    const purchaseOrderLine = (await client.query(
      `INSERT INTO purchase_order_lines(company_id,purchase_order_id,item_id,line_no,ordered_quantity,uom,status)
       VALUES($1,$2,$3,1,10,'EA','open') RETURNING id`,
      [company.id, purchaseOrder.id, item.id],
    )).rows[0];
    const receipt = (await client.query(
      `INSERT INTO inbound_receipts(company_id,warehouse_id,receipt_no,supplier)
       VALUES($1,$2,$3,'Purchasing QA Supplier') RETURNING id`,
      [company.id, warehouse.id, `QA-R-${stamp}`],
    )).rows[0];
    const receiptLine = (await client.query(
      `INSERT INTO inbound_receipt_lines(company_id,receipt_id,item_id,expected_quantity,uom,purchase_order_line_id)
       VALUES($1,$2,$3,10,'EA',$4) RETURNING id`,
      [company.id, receipt.id, item.id, purchaseOrderLine.id],
    )).rows[0];
    await client.query(
      `UPDATE inbound_receipt_lines SET accepted_quantity=4,status='partial' WHERE id=$1`,
      [receiptLine.id],
    );
    const state = (await client.query(
      `SELECT received_quantity::text,status FROM purchase_order_lines WHERE id=$1`,
      [purchaseOrderLine.id],
    )).rows[0];
    assert.deepEqual(state, { received_quantity: '4.000000', status: 'partial' });
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
