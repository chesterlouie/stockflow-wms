import {getSession} from '../../../../../lib/auth';
import {withTenant} from '../../../../../lib/db';
import {POST as inspectReceipt} from '../inspect/route';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session)return Response.redirect(new URL('/signin',request.url),303);
  const {id}=await params;
  const form=await request.formData();
  const lineId=String(form.get('lineId')||'');
  const scannedValue=String(form.get('receiptBarcode')||'').trim();
  const valid=await withTenant(session.companyId,async client=>(await client.query(`
    SELECT 1
    FROM inbound_receipt_lines line
    JOIN inbound_receipts receipt ON receipt.id=line.receipt_id AND receipt.company_id=line.company_id
    JOIN items item ON item.id=line.item_id AND item.company_id=line.company_id
    LEFT JOIN item_barcodes barcode ON barcode.item_id=line.item_id AND barcode.company_id=line.company_id
    WHERE line.company_id=$1 AND line.id=$2 AND receipt.id=$3
      AND (barcode.barcode_value=$4 OR upper(item.sku)=upper($4))
  `,[session.companyId,lineId,id,scannedValue])).rowCount);
  if(!valid)return Response.redirect(new URL(`/app/receiving/mobile/${id}?error=barcode`,request.url),303);
  const result=await inspectReceipt(new Request(request.url,{method:'POST',body:form}),{params:Promise.resolve({id})});
  const location=result.headers.get('location');
  if(location){
    const target=new URL(location,request.url);
    if(target.searchParams.has('inspected'))return Response.redirect(new URL('/app/receiving/mobile?received=1',request.url),303);
    const error=target.searchParams.get('error')||'state';
    return Response.redirect(new URL(`/app/receiving/mobile/${id}?error=${encodeURIComponent(error)}`,request.url),303);
  }
  return result;
}
