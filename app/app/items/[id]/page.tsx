import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getSession} from '../../../../lib/auth';
import {tenantRows} from '../../../../lib/db';

type Item={id:string;sku:string;description:string;base_uom:string;category:string|null;tracking_method:string;allocation_method:string;status:string};
type Barcode={id:string;barcode_value:string;barcode_format:string;generation_mode:string;uom:string;quantity_in_base:string;is_primary:boolean};
type Conversion={id:string;uom:string;units_per_base:string};

export default async function ItemDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{created?:string;uomSaved?:string;error?:string}>}){
  const s=await getSession(),{id}=await params,q=await searchParams;
  const item=(s?await tenantRows<Item>(s.companyId,'SELECT id,sku,description,base_uom,category,tracking_method,allocation_method,status FROM items WHERE company_id=$1 AND id=$2',[s.companyId,id]):[])[0];
  if(!item)notFound();
  const [barcodes,conversions]=await Promise.all([
    tenantRows<Barcode>(s!.companyId,'SELECT id,barcode_value,barcode_format,generation_mode,uom,quantity_in_base::text,is_primary FROM item_barcodes WHERE company_id=$1 AND item_id=$2 ORDER BY is_primary DESC,created_at',[s!.companyId,id]),
    tenantRows<Conversion>(s!.companyId,'SELECT id,uom,units_per_base::text FROM item_uom_conversions WHERE company_id=$1 AND item_id=$2 AND active ORDER BY uom',[s!.companyId,id]),
  ]);
  return <div className="app-content">
    <div className="page-heading"><div><h1>{item.sku}</h1><p>{item.description}</p></div><Link href="/app/items" className="button button-secondary">Back to items</Link></div>
    {(q.created||q.uomSaved)&&<div className="success-banner">Item packaging details saved.</div>}{q.error&&<div className="form-error">Check the barcode or unit conversion details.</div>}
    <div className="form-layout"><section className="panel"><h2>Barcode IDs</h2><table className="data-table"><thead><tr><th>Barcode</th><th>Format</th><th>Unit</th><th>Base quantity</th><th>Source</th><th>Label</th></tr></thead><tbody>{barcodes.map(x=><tr key={x.id}><td><strong>{x.barcode_value}</strong>{x.is_primary&&<span className="badge barcode-primary">Primary</span>}</td><td>{x.barcode_format}</td><td>{x.uom}</td><td>{x.quantity_in_base}</td><td>{x.generation_mode}</td><td><Link className="table-link" href={`/app/items/${id}/barcodes/${x.id}/label`}>Print label</Link></td></tr>)}</tbody></table>
      <h2 className="item-rules-heading">Unit conversions</h2><table className="data-table"><thead><tr><th>Alternate unit</th><th>Equivalent</th></tr></thead><tbody>{conversions.length?conversions.map(x=><tr key={x.id}><td><strong>{x.uom}</strong></td><td>1 {x.uom} = {x.units_per_base} {item.base_uom}</td></tr>):<tr><td colSpan={2} className="empty-cell">No alternate units configured.</td></tr>}</tbody></table>
      <h2 className="item-rules-heading">Inventory rules</h2><div className="item-facts"><span><small>Category</small><strong>{item.category||'Uncategorized'}</strong></span><span><small>Base UOM</small><strong>{item.base_uom}</strong></span><span><small>Tracking</small><strong>{item.tracking_method}</strong></span><span><small>Allocation</small><strong>{item.allocation_method.toUpperCase()}</strong></span></div>
    </section><aside className="panel"><h2>Add pack barcode</h2><form className="form-stack compact-form" method="post" action={`/api/items/${id}/barcodes`}><div className="field"><label>Barcode value</label><input name="barcodeValue" placeholder="Type or scan barcode" required/></div><div className="form-row"><div className="field"><label>Format</label><select name="barcodeFormat"><option value="code128">Code 128</option><option value="ean13">EAN-13</option><option value="upca">UPC-A</option><option value="qr">QR</option><option value="gs1">GS1</option></select></div><div className="field"><label>Unit</label><input name="uom" placeholder="CASE" required/></div></div><div className="field"><label>Quantity in {item.base_uom}</label><input name="quantityInBase" type="number" min="0.000001" step="any" defaultValue="1" required/></div><button className="button button-primary">Add barcode</button></form>
      <h2 className="item-rules-heading">Add unit conversion</h2><form className="form-stack compact-form" method="post" action={`/api/items/${id}/uom`}><div className="field"><label>Alternate unit</label><input name="uom" placeholder="CASE" required/></div><div className="field"><label>{item.base_uom} in one alternate unit</label><input name="unitsPerBase" type="number" min="0.000001" step="any" placeholder="12" required/></div><button className="button button-secondary">Save conversion</button></form>
    </aside></div>
  </div>;
}
