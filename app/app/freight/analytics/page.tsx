import Link from 'next/link';
import { getSession } from '../../../../lib/auth';
import { tenantRows } from '../../../../lib/db';

type Kpi={activity_month:string;currency:string;shipments:string;estimated_cost:string;actual_or_estimated_cost:string;recorded_variance:string;average_cost_per_shipment:string;cost_per_unit:string|null;warehouse:string;store:string|null};
const money=(value:string|null,currency:string)=>`${currency} ${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default async function FreightAnalytics(){
  const session=await getSession();
  if(!session)return null;
  const rows=await tenantRows<Kpi>(session.companyId,`SELECT k.*,w.name warehouse,s.name store
    FROM carrier_freight_kpis k JOIN warehouses w ON w.id=k.warehouse_id
    LEFT JOIN requesting_stores s ON s.id=k.store_id
    WHERE k.company_id=$1 ORDER BY k.activity_month DESC,w.name,s.name NULLS LAST`,[session.companyId]);
  const totals=rows.reduce((a,x)=>({shipments:a.shipments+Number(x.shipments),estimated:a.estimated+Number(x.estimated_cost),actual:a.actual+Number(x.actual_or_estimated_cost),variance:a.variance+Number(x.recorded_variance)}),{shipments:0,estimated:0,actual:0,variance:0});
  const currency=rows[0]?.currency||'PHP';
  return <div className="app-content">
    <div className="page-heading"><div><h1>Freight analytics</h1><p>Monitor estimated, invoiced, and allocated delivery cost by period and destination.</p></div><div className="page-actions"><Link className="button button-secondary" href="/app/freight">Cost control</Link><Link className="button button-primary" href="/api/freight/export">Export CSV</Link></div></div>
    <div className="metric-grid">
      <article className="metric-card"><span>Shipments costed</span><strong>{totals.shipments}</strong></article>
      <article className="metric-card"><span>Estimated cost</span><strong>{money(String(totals.estimated),currency)}</strong></article>
      <article className="metric-card"><span>Actual or estimated</span><strong>{money(String(totals.actual),currency)}</strong></article>
      <article className="metric-card"><span>Recorded variance</span><strong>{money(String(totals.variance),currency)}</strong></article>
    </div>
    <section className="panel"><h2>Cost performance</h2>{rows.length===0?<div className="empty-state"><strong>No freight costs recorded</strong><p>Calculate a dispatched shipment cost to begin tracking performance.</p></div>:<div className="table-scroll"><table><thead><tr><th>Month</th><th>Warehouse / store</th><th>Shipments</th><th>Estimated</th><th>Actual or estimated</th><th>Variance</th><th>Average / shipment</th><th>Cost / unit</th></tr></thead><tbody>{rows.map((x,i)=><tr key={`${x.activity_month}-${x.warehouse}-${x.store}-${i}`}><td>{x.activity_month}</td><td><strong>{x.warehouse}</strong><br/><small>{x.store||'External customer'}</small></td><td>{x.shipments}</td><td>{money(x.estimated_cost,x.currency)}</td><td>{money(x.actual_or_estimated_cost,x.currency)}</td><td>{money(x.recorded_variance,x.currency)}</td><td>{money(x.average_cost_per_shipment,x.currency)}</td><td>{x.cost_per_unit===null?'—':money(x.cost_per_unit,x.currency)}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
