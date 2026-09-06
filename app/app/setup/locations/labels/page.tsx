import bwipjs from 'bwip-js';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import PrintButton from '../../../../components/PrintButton';
import {getSession} from '../../../../../lib/auth';
import {tenantRows} from '../../../../../lib/db';
export const dynamic='force-dynamic';
type LocationLabel={id:string;code:string;type:string;warehouse_code:string;warehouse_name:string};
export default async function BulkLocationLabels({searchParams}:{searchParams:Promise<{warehouseId?:string;format?:string}>}){
 const s=await getSession(),q=await searchParams;if(!s||!q.warehouseId)notFound();const format=q.format==='code128'?'code128':'qrcode';
 const rows=await tenantRows<LocationLabel>(s.companyId,`SELECT l.id,l.code,l.type,w.code warehouse_code,w.name warehouse_name FROM locations l JOIN warehouses w ON w.company_id=l.company_id AND w.id=l.warehouse_id WHERE l.company_id=$1 AND l.warehouse_id=$2 AND l.active=true ORDER BY l.code`,[s.companyId,q.warehouseId]);if(!rows.length)notFound();
 return <main className="item-label-page"><div className="item-label-actions"><form method="get"><input type="hidden" name="warehouseId" value={q.warehouseId}/><label>Format <select name="format" defaultValue={format}><option value="qrcode">QR</option><option value="code128">Code 128</option></select></label><button className="button button-secondary">Update preview</button></form><PrintButton label="Print all location labels"/><Link className="button button-secondary" href="/app/setup">Back to setup</Link></div><div className="item-label-sheet">{rows.map(row=>{const svg=bwipjs.toSVG({bcid:format,text:row.code,scale:format==='qrcode'?5:3,height:18,padding:4,includetext:false} as Parameters<typeof bwipjs.toSVG>[0]);return <section className="item-barcode-label" key={row.id}><div><small>WAREVANTA LOCATION</small><h1>{row.code}</h1><p>{row.warehouse_code} — {row.warehouse_name}</p></div><div className="barcode-symbol" dangerouslySetInnerHTML={{__html:svg}}/><strong className="barcode-human">{row.code}</strong><div className="item-label-meta"><span><small>Warehouse</small><strong>{row.warehouse_code}</strong></span><span><small>Location type</small><strong>{row.type.toUpperCase()}</strong></span><span><small>Scan value</small><strong>{row.code}</strong></span></div></section>})}</div></main>;
}
