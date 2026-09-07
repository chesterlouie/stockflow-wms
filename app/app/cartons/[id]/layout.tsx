import {notFound} from 'next/navigation';
import {getSession} from '../../../../lib/auth';
import {tenantRows} from '../../../../lib/db';

export default async function CartonAccessLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session)notFound();
  const {id}=await params;
  const rows=await tenantRows(session.companyId,`SELECT pc.id FROM packing_cartons pc JOIN sales_orders o ON o.company_id=pc.company_id AND o.id=pc.order_id WHERE pc.company_id=$1 AND pc.id=$2 AND ($3='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=o.company_id AND a.user_id=$4 AND a.warehouse_id=o.warehouse_id))`,[session.companyId,id,session.role,session.userId]);
  if(!rows.length)notFound();
  return children;
}
