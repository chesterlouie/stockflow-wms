import {getSession} from '../../../../../lib/auth';
import {withTenant} from '../../../../../lib/db';
import {matchesItemIdentifier} from '../../../../../lib/barcode-match';
import {POST as inspectReceipt} from '../inspect/route';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session)return Response.redirect(new URL('/signin',request.url),303);
  const {id}=await params;
  const form=await request.formData();
  const lineId=String(form.get('lineId')||'');
  const scannedValue=form.get('receiptBarcode');
  const expected=await withTenant(session.companyId,async client=>(await client.query<{sku:string;barcodes:string[]}>(`
    SELECT item.sku,
      coalesce(array_agg(barcode.barcode_value ORDER BY barcode.is_primary DESC,barcode.created_at)
        FILTER (WHERE barcode.id IS NOT NULL),'{}') AS barcodes
    FROM inbound_receipt_lines line
    JOIN inbound_receipts receipt ON receipt.id=line.receipt_id AND receipt.company_id=line.company_id
    JOIN items item ON item.id=line.item_id AND item.company_id=line.company_id
    LEFT JOIN item_barcodes barcode ON barcode.item_id=line.item_id AND barcode.company_id=line.company_id
    WHERE line.company_id=$1 AND line.id=$2 AND receipt.id=$3
    GROUP BY item.id,item.sku
  `,[session.companyId,lineId,id])).rows[0]);
  const valid=Boolean(expected&&matchesItemIdentifier(scannedValue,expected.sku,expected.barcodes));
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
