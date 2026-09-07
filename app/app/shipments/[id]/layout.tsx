import {notFound} from 'next/navigation';
import {getSession} from '../../../../lib/auth';
import {tenantRows} from '../../../../lib/db';

export default async function ShipmentAccessLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session)notFound();
  const {id}=await params;
  const rows=await tenantRows(session.companyId,`SELECT sh.id FROM shipments sh JOIN sales_orders o ON o.company_id=sh.company_id AND o.id=sh.order_id WHERE sh.company_id=$1 AND sh.id=$2 AND ($3='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=o.company_id AND a.user_id=$4 AND a.warehouse_id=o.warehouse_id))`,[session.companyId,id,session.role,session.userId]);
  if(!rows.length)notFound();
  return children;
}
