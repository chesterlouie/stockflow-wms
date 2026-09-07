import {notFound} from 'next/navigation';
import {getSession} from '../../../../lib/auth';
import {tenantRows} from '../../../../lib/db';

export default async function ReceiptAccessLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){
  const session=await getSession();const {id}=await params;
  if(!session)notFound();
  const allowed=await tenantRows(session.companyId,`SELECT 1 FROM inbound_receipts r WHERE r.company_id=$1 AND r.id=$2 AND ($3='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=r.company_id AND a.user_id=$4 AND a.warehouse_id=r.warehouse_id))`,[session.companyId,id,session.role,session.userId]);
  if(!allowed.length)notFound();
  return children;
}
