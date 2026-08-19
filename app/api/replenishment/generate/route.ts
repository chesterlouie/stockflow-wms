import { getSession } from '../../../../lib/auth';
import { withTenant } from '../../../../lib/db';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL('/signin', request.url), 303);
  if (!['owner', 'admin', 'manager'].includes(session.role)) return new Response('Forbidden', { status: 403 });
  const created = await withTenant(session.companyId, async (client) => {
    const needs = (await client.query(`SELECT r.item_id,r.location_id AS to_id,r.target_quantity,i.base_uom,
      i.allocation_method,l.warehouse_id,COALESCE((SELECT sum(quantity) FROM inventory_ledger x
      WHERE x.company_id=r.company_id AND x.item_id=r.item_id AND x.location_id=r.location_id),0) AS current_qty
      FROM item_location_rules r JOIN locations l ON l.id=r.location_id JOIN items i ON i.id=r.item_id
      WHERE r.company_id=$1 AND l.type='picking' AND COALESCE((SELECT sum(quantity) FROM inventory_ledger x
      WHERE x.company_id=r.company_id AND x.item_id=r.item_id AND x.location_id=r.location_id),0)<r.min_quantity
      AND NOT EXISTS(SELECT 1 FROM replenishment_tasks t WHERE t.company_id=r.company_id
      AND t.item_id=r.item_id AND t.to_location_id=r.location_id AND t.status='pending')`, [session.companyId])).rows;
    let count = 0;
    for (const need of needs) {
      const order = need.allocation_method === 'fefo' ? 'x.expiry_date ASC NULLS LAST,oldest_stock ASC'
        : need.allocation_method === 'lifo' ? 'oldest_stock DESC' : 'oldest_stock ASC';
      const reserve = (await client.query(`SELECT l.id,x.lot_number,x.expiry_date,sum(x.quantity) AS available,
        min(x.created_at) AS oldest_stock FROM locations l JOIN inventory_ledger x
        ON x.location_id=l.id AND x.company_id=l.company_id WHERE l.company_id=$1 AND l.warehouse_id=$2
        AND l.type='storage' AND x.item_id=$3 GROUP BY l.id,x.lot_number,x.expiry_date HAVING sum(x.quantity)>0
        ORDER BY EXISTS(SELECT 1 FROM item_location_rules r WHERE r.company_id=$1 AND r.item_id=$3
        AND r.location_id=l.id AND r.preferred_putaway) DESC,${order} LIMIT 1`,
      [session.companyId, need.warehouse_id, need.item_id])).rows[0];
      if (!reserve) continue;
      const quantity = Math.min(Number(need.target_quantity) - Number(need.current_qty), Number(reserve.available));
      if (quantity <= 0) continue;
      await client.query(`INSERT INTO replenishment_tasks(company_id,item_id,from_location_id,to_location_id,
        quantity,uom,lot_number,expiry_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [session.companyId, need.item_id, reserve.id, need.to_id, quantity, need.base_uom, reserve.lot_number, reserve.expiry_date]);
      count++;
    }
    return count;
  });
  return Response.redirect(new URL(`/app/replenishment?generated=${created}`, request.url), 303);
}
