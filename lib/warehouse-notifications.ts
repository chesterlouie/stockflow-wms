type QueryClient={query:(text:string,values?:unknown[])=>Promise<unknown>};

export async function notifyWarehouseReviewers(c:QueryClient,input:{companyId:string;warehouseId:string;orderId:string;orderNo:string}){
  await c.query(`INSERT INTO warehouse_notifications(company_id,warehouse_id,user_id,event_key,title,message,order_id)
    SELECT $1,$2,m.user_id,$3,'Store request needs warehouse review',$4,$5
    FROM company_members m
    WHERE m.company_id=$1 AND m.role IN('owner','admin','manager')
      AND (m.role='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=$1 AND a.user_id=m.user_id AND a.warehouse_id=$2))
    ON CONFLICT DO NOTHING`,[input.companyId,input.warehouseId,`store-request:${input.orderId}:warehouse-pending`,`${input.orderNo} is ready for warehouse review.`,input.orderId]);
}
