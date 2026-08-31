import Link from 'next/link';
import {getSession} from '../../../../lib/auth';
import {tenantRows} from '../../../../lib/db';

export const dynamic='force-dynamic';
type Task={id:string;receipt_no:string;external_reference:string|null;supplier:string;sku:string;description:string;remaining:string;uom:string;status:string};

export default async function MobileReceiving({searchParams}:{searchParams:Promise<{barcode?:string;received?:string}>}){
  const session=await getSession();
  const query=await searchParams;
  const barcode=(query.barcode||'').trim();
  const tasks=session?await tenantRows<Task>(session.companyId,`SELECT r.id,r.receipt_no,r.external_reference,r.supplier,i.sku,i.description,(rl.expected_quantity-rl.accepted_quantity-rl.held_quantity-rl.damaged_quantity)::text AS remaining,rl.uom,r.status FROM inbound_receipts r JOIN inbound_receipt_lines rl ON rl.receipt_id=r.id JOIN items i ON i.id=rl.item_id LEFT JOIN item_barcodes b ON b.item_id=i.id AND b.company_id=i.company_id WHERE r.company_id=$1 AND r.status IN('expected','partial') AND ($2='' OR r.receipt_no=$2 OR r.external_reference=$2 OR upper(i.sku)=upper($2) OR b.barcode_value=$2) GROUP BY r.id,i.id,rl.id ORDER BY r.expected_date NULLS LAST,r.created_at LIMIT 30`,[session.companyId,barcode]):[];
  return <div className="app-content">
    <div className="page-heading"><div><h1>Mobile receiving</h1><p>Scan a receipt label, PO number, SKU, or item barcode.</p></div><Link href="/app/receiving" className="button button-secondary">Desktop receiving</Link></div>
    {query.received&&<div className="success-banner">Receipt posted successfully. Inventory and putaway work were updated.</div>}
    <form className="panel form-stack" method="get"><div className="field"><label>Receipt, PO, SKU, or item barcode</label><input name="barcode" defaultValue={barcode} autoFocus autoCapitalize="characters" placeholder="Scan to find an inbound task" required/></div><button className="button button-primary">Find receiving task</button></form>
    <section className="panel inventory-history"><h2>{barcode?'Matching open tasks':'Next open tasks'}</h2>{tasks.length?tasks.map(task=><Link key={task.id} href={`/app/receiving/mobile/${task.id}`} className="pick-card"><div><strong>{task.receipt_no} · {task.sku}</strong><small>{task.supplier} · PO {task.external_reference||'—'}</small><small>{task.description}</small></div><span className="badge">{task.remaining} {task.uom} remaining</span></Link>):<div className="empty-cell"><p>No open receiving task matches that scan in this company workspace.</p>{barcode&&<small>Confirm that the receipt was released, is not already completed, and belongs to the signed-in company.</small>}</div>}</section>
  </div>;
}
