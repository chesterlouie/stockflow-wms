import bwipjs from 'bwip-js';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import PrintButton from '../../../../../../components/PrintButton';
import {getSession} from '../../../../../../../lib/auth';
import {tenantRows} from '../../../../../../../lib/db';

export const dynamic='force-dynamic';
type Label={sku:string;description:string;base_uom:string;barcode_value:string;barcode_format:string;uom:string;quantity_in_base:string;is_primary:boolean};
const formats:Record<string,string>={code128:'code128',ean13:'ean13',upca:'upca',qr:'qrcode',gs1:'gs1-128'};

export default async function ItemBarcodeLabel({params,searchParams}:{params:Promise<{id:string;barcodeId:string}>;searchParams:Promise<{copies?:string}>}){
  const s=await getSession();
  const {id,barcodeId}=await params;
  const query=await searchParams;
  const row=(s?await tenantRows<Label>(s.companyId,`SELECT i.sku,i.description,i.base_uom,b.barcode_value,b.barcode_format,b.uom,b.quantity_in_base::text,b.is_primary FROM items i JOIN item_barcodes b ON b.item_id=i.id AND b.company_id=i.company_id WHERE i.company_id=$1 AND i.id=$2 AND b.id=$3`,[s.companyId,id,barcodeId]):[])[0];
  if(!row)notFound();
  const copies=Math.min(20,Math.max(1,Number.parseInt(query.copies||'1',10)||1));
  let svg:string;
  try{svg=bwipjs.toSVG({bcid:formats[row.barcode_format]||'code128',text:row.barcode_value,scale:3,height:18,padding:4,includetext:false} as Parameters<typeof bwipjs.toSVG>[0])}catch{svg=bwipjs.toSVG({bcid:'qrcode',text:row.barcode_value,scale:4,padding:3} as Parameters<typeof bwipjs.toSVG>[0])}
  return <main className="item-label-page"><div className="item-label-actions"><form method="get"><label>Copies <input name="copies" type="number" min="1" max="20" defaultValue={copies}/></label><button className="button button-secondary">Update</button></form><PrintButton/><Link className="button button-secondary" href={`/app/items/${id}`}>Back to item</Link></div><div className="item-label-sheet">{Array.from({length:copies},(_,index)=><section className="item-barcode-label" key={index}><div><small>WAREVANTA ITEM</small><h1>{row.sku}</h1><p>{row.description}</p></div><div className="barcode-symbol" dangerouslySetInnerHTML={{__html:svg}}/><strong className="barcode-human">{row.barcode_value}</strong><div className="item-label-meta"><span><small>Unit</small><strong>{row.uom}</strong></span><span><small>Contains</small><strong>{row.quantity_in_base} {row.base_uom}</strong></span><span><small>Format</small><strong>{row.barcode_format.toUpperCase()}</strong></span>{row.is_primary&&<span><small>Type</small><strong>Primary</strong></span>}</div></section>)}</div></main>;
}
