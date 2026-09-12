import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

test('alternate order units normalize to item base units', async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const company = (await client.query(
      `INSERT INTO companies(name,slug) VALUES('UOM QA',$1) RETURNING id`,
      [`uom-qa-${stamp}`],
    )).rows[0];
    await client.query(`SELECT set_config('app.company_id',$1,true)`, [company.id]);
    const warehouse = (await client.query(
      `INSERT INTO warehouses(company_id,code,name) VALUES($1,'QA','UOM QA Warehouse') RETURNING id`,
      [company.id],
    )).rows[0];
    const item = (await client.query(
      `INSERT INTO items(company_id,sku,description,base_uom) VALUES($1,$2,'UOM QA Item','EA') RETURNING id,base_uom`,
      [company.id, `QA-UOM-${stamp}`],
    )).rows[0];
    await client.query(
      `INSERT INTO item_uom_conversions(company_id,item_id,uom,units_per_base) VALUES($1,$2,'QA_CASE',12)`,
      [company.id, item.id],
    );
    const order = (await client.query(
      `INSERT INTO sales_orders(company_id,warehouse_id,order_no,customer) VALUES($1,$2,$3,'UOM QA') RETURNING id`,
      [company.id, warehouse.id, `QA-UOM-${stamp}`],
    )).rows[0];
    const line = (await client.query(
      `INSERT INTO sales_order_lines(company_id,order_id,item_id,line_no,ordered_quantity,uom) VALUES($1,$2,$3,1,2,'QA_CASE') RETURNING ordered_quantity::text,uom`,
      [company.id, order.id, item.id],
    )).rows[0];
    assert.equal(Number(line.ordered_quantity), 24);
    assert.equal(line.uom, item.base_uom);
    await assert.rejects(
      client.query(
        `INSERT INTO sales_order_lines(company_id,order_id,item_id,line_no,ordered_quantity,uom) VALUES($1,$2,$3,2,1,'UNKNOWN_UOM')`,
        [company.id, order.id, item.id],
      ),
      /uom_conversion_not_configured/,
    );
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
});
