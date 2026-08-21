import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getSession} from '../../../../../lib/auth';
import {tenantRows} from '../../../../../lib/db';

export const dynamic='force-dynamic';

type Receipt={id:string;receipt_no:string;line_id:string;sku:string;description:string;tracking_method:string;expected_quantity:string;received:string;remaining:string;uom:string};
type Location={id:string;code:string;type:string};

export default async function MobileTask({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}) {
  const s=await getSession();
  const {id}=await params;
  const q=await searchParams;
  const r=(s?await tenantRows<Receipt>(s.companyId,`SELECT r.id,r.receipt_no,rl.id AS line_id,i.sku,i.description,i.tracking_method,rl.expected_quantity::text,(rl.accepted_quantity+rl.held_quantity+rl.damaged_quantity)::text AS received,(rl.expected_quantity-rl.accepted_quantity-rl.held_quantity-rl.damaged_quantity)::text AS remaining,rl.uom FROM inbound_receipts r JOIN inbound_receipt_lines rl ON rl.receipt_id=r.id JOIN items i ON i.id=rl.item_id WHERE r.company_id=$1 AND r.id=$2 AND r.status IN('expected','partial')`,[s.companyId,id]):[])[0];
  if(!r)notFound();
  const locations=await tenantRows<Location>(s!.companyId,'SELECT id,code,type FROM locations WHERE company_id=$1 AND active=true ORDER BY code',[s!.companyId]);

  return <div className="app-content">
    <div className="page-heading"><div><h1>{r.receipt_no}</h1><p>{r.sku} — {r.description}</p></div><Link href="/app/receiving/mobile" className="button button-secondary">Back to queue</Link></div>
    {q.error&&<div className="form-error">The receipt was not posted. Check scans, quantities, and tracking details.</div>}
    <section className="panel">
      <div className="item-facts"><span><small>Expected</small><strong>{r.expected_quantity}</strong></span><span><small>Received</small><strong>{r.received}</strong></span><span><small>Remaining</small><strong>{r.remaining} {r.uom}</strong></span><span><small>Tracking</small><strong>{r.tracking_method}</strong></span></div>
      <form className="form-stack" method="post" action={`/api/receiving/${id}/mobile-inspect`}>
        <input type="hidden" name="lineId" value={r.line_id}/>
        <div className="field"><label>Confirm item barcode</label><input name="receiptBarcode" placeholder="Scan expected item" required/></div>
        <div className="form-row"><div className="field"><label>Accepted</label><input name="acceptedQuantity" type="number" min="0" step="any" defaultValue={r.remaining}/></div><div className="field"><label>Hold</label><input name="heldQuantity" type="number" min="0" step="any" defaultValue="0"/></div><div className="field"><label>Damaged</label><input name="damagedQuantity" type="number" min="0" step="any" defaultValue="0"/></div></div>
        <div className="field"><label>Receiving location</label><select name="receivingLocationId">{locations.filter(x=>x.type==='receiving').map(x=><option key={x.id} value={x.id}>{x.code}</option>)}</select></div>
        <div className="field"><label>Putaway location</label><select name="putawayLocationId">{locations.filter(x=>x.type==='storage').map(x=><option key={x.id} value={x.id}>{x.code}</option>)}</select></div>
        <div className="form-row"><div className="field"><label>Hold location</label><select name="holdLocationId"><option value="">Not used</option>{locations.filter(x=>x.type==='hold').map(x=><option key={x.id} value={x.id}>{x.code}</option>)}</select></div><div className="field"><label>Damaged location</label><select name="damagedLocationId"><option value="">Not used</option>{locations.filter(x=>x.type==='damaged').map(x=><option key={x.id} value={x.id}>{x.code}</option>)}</select></div></div>
        {['lot','lot_expiry'].includes(r.tracking_method)&&<div className="field"><label>Lot number</label><input name="lotNumber" required/></div>}
        {r.tracking_method==='lot_expiry'&&<div className="field"><label>Expiry date</label><input name="expiryDate" type="date" required/></div>}
        {r.tracking_method==='serial'&&<div className="field"><label>Serial numbers</label><textarea name="serialNumbers" rows={8} placeholder="One serial per line" required/></div>}
        <button className="button button-primary">Post receipt</button>
      </form>
    </section>
  </div>;
}
