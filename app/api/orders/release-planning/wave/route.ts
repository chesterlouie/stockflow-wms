import { getSession } from '../../../../../lib/auth';
import { withTenant } from '../../../../../lib/db';
import { assertWarehouseAccess } from '../../../../../lib/warehouse-access';

export async function POST(request:Request) {
  const session=await getSession();
  if(!session)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin','manager'].includes(session.role))return Response.redirect(new URL('/app/orders/release-planning?error=role',request.url),303);
  const form=await request.formData(),orderIds=form.getAll('orderId').map(String).filter(Boolean),note=String(form.get('note')||'').trim();
  if(!orderIds.length||note.length<2)return Response.redirect(new URL('/app/orders/release-planning?error=selection',request.url),303);
  try{
    const result=await withTenant(session.companyId,async c=>{
      await c.query(`SELECT id FROM sales_orders WHERE company_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,[session.companyId,orderIds]);
      const orders=(await c.query(`SELECT p.* FROM order_release_plan p WHERE p.company_id=$1 AND p.order_id=ANY($2::uuid[]) AND p.planning_status='ready_to_wave' ORDER BY p.priority_score DESC,p.created_at`,[session.companyId,orderIds])).rows;
      if(orders.length!==new Set(orderIds).size)throw new Error('INELIGIBLE');
      const warehouseId=orders[0].warehouse_id;
      if(orders.some(x=>x.warehouse_id!==warehouseId))throw new Error('WAREHOUSE');
      await assertWarehouseAccess(c,session,warehouseId);
      const period=new Date().toISOString().slice(0,7).replace('-','');
      const values=[session.companyId,warehouseId,'pick_wave',period];
      let sequence=(await c.query(`UPDATE document_sequences SET next_value=next_value+1 WHERE company_id=$1 AND scope_id=$2 AND document_type=$3 AND period=$4 RETURNING next_value-1 issued`,values)).rows[0];
      if(!sequence)sequence=(await c.query(`INSERT INTO document_sequences(company_id,scope_id,document_type,period,next_value) VALUES($1,$2,$3,$4,2) RETURNING 1 issued`,values)).rows[0];
      const waveNo=`WAVE-${period}-${String(sequence.issued).padStart(6,'0')}`;
      const wave=(await c.query(`INSERT INTO pick_waves(company_id,warehouse_id,wave_no,created_by) VALUES($1,$2,$3,$4) RETURNING id`,[session.companyId,warehouseId,waveNo,session.userId])).rows[0];
      const assigned=await c.query(`UPDATE pick_tasks p SET wave_id=$1 FROM stock_allocations a,sales_order_lines l WHERE p.company_id=$2 AND p.allocation_id=a.id AND a.order_line_id=l.id AND l.order_id=ANY($3::uuid[]) AND p.status='pending' AND p.wave_id IS NULL`,[wave.id,session.companyId,orderIds]);
      if(!assigned.rowCount)throw new Error('NO_TASKS');
      await c.query(`INSERT INTO order_release_events(company_id,order_id,warehouse_id,event_type,planning_status,recommendation,score,wave_id,note,created_by) SELECT $1,p.order_id,p.warehouse_id,'wave_created',p.planning_status,p.recommended_action,p.priority_score,$3,$4,$5 FROM order_release_plan p WHERE p.company_id=$1 AND p.order_id=ANY($2::uuid[])`,[session.companyId,orderIds,wave.id,note,session.userId]);
      await c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'release_plan_wave_created','pick_wave',$3,$4::jsonb)`,[session.companyId,session.userId,wave.id,JSON.stringify({waveNo,orderIds,taskCount:assigned.rowCount,note})]);
      return {waveNo,count:assigned.rowCount};
    });
    return Response.redirect(new URL(`/app/orders/release-planning?wave=${encodeURIComponent(result.waveNo)}&tasks=${result.count}`,request.url),303);
  }catch(error){const code=error instanceof Error?error.message.toLowerCase():'failed';return Response.redirect(new URL(`/app/orders/release-planning?error=${code}`,request.url),303)}
}
