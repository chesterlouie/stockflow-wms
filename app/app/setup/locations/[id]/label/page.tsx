import bwipjs from 'bwip-js';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import PrintButton from '../../../../../components/PrintButton';
import {getSession} from '../../../../../../lib/auth';
import {tenantRows} from '../../../../../../lib/db';
export const dynamic='force-dynamic';
type LocationLabel={code:string;type:string;warehouse_code:string;warehouse_name:string};
export default async function LocationLabelPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{copies?:string;format?:string}>}){
 const s=await getSession(),{id}=await params,q=await searchParams;
 const row=(s?await tenantRows<LocationLabel>(s.companyId,`SELECT l.code,l.type,w.code warehouse_code,w.name warehouse_name FROM locations l JOIN warehouses w ON w.company_id=l.company_id AND w.id=l.warehouse_id WHERE l.company_id=$1 AND l.id=$2`,[s.companyId,id]):[])[0];if(!row)notFound();
 const copies=Math.min(20,Math.max(1,Number.parseInt(q.copies||'1',10)||1)),format=q.format==='code128'?'code128':'qrcode';
 const svg=bwipjs.toSVG({bcid:format,text:row.code,scale:format==='qrcode'?5:3,height:18,padding:4,includetext:false} as Parameters<typeof bwipjs.toSVG>[0]);
 return <main className="item-label-page"><div className="item-label-actions"><form method="get"><label>Format <select name="format" defaultValue={format}><option value="qrcode">QR</option><option value="code128">Code 128</option></select></label><label>Copies <input name="copies" type="number" min="1" max="20" defaultValue={copies}/></label><button className="button button-secondary">Update preview</button></form><PrintButton label="Print location label"/><Link className="button button-secondary" href="/app/setup">Back to setup</Link></div><div className="item-label-sheet">{Array.from({length:copies},(_,i)=><section className="item-barcode-label" key={i}><div><small>WAREVANTA LOCATION</small><h1>{row.code}</h1><p>{row.warehouse_code} — {row.warehouse_name}</p></div><div className="barcode-symbol" dangerouslySetInnerHTML={{__html:svg}}/><strong className="barcode-human">{row.code}</strong><div className="item-label-meta"><span><small>Warehouse</small><strong>{row.warehouse_code}</strong></span><span><small>Location type</small><strong>{row.type.toUpperCase()}</strong></span><span><small>Scan value</small><strong>{row.code}</strong></span></div></section>)}</div></main>;
}
