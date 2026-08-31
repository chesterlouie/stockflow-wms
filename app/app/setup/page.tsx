import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { plans, type PlanId } from "../../../lib/billing";
import { tenantRows } from "../../../lib/db";
import WarehouseLimitPrompt from "../../components/WarehouseLimitPrompt";

export const metadata = { title: "Warehouse setup" };
export const dynamic = "force-dynamic";
type Warehouse = { id: string; code: string; name: string; timezone: string; active: boolean };
type Location = { id: string; warehouse_name: string; code: string; type: string };
type CompanyPlan = { subscription_plan: PlanId };

export default async function Setup({ searchParams }: { searchParams: Promise<{ created?: string; warehouseCreated?: string; error?: string }> }) {
  const session = await getSession();
  const params = await searchParams;
  const warehouses = session ? await tenantRows<Warehouse>(session.companyId, "SELECT id,code,name,timezone,active FROM warehouses WHERE company_id=$1 ORDER BY name", [session.companyId]) : [];
  const locations = session ? await tenantRows<Location>(session.companyId, `SELECT l.id,w.name AS warehouse_name,l.code,l.type FROM locations l JOIN warehouses w ON w.company_id=l.company_id AND w.id=l.warehouse_id WHERE l.company_id=$1 ORDER BY w.name,l.code`, [session.companyId]) : [];
  const company = (session ? await tenantRows<CompanyPlan>(session.companyId, "SELECT subscription_plan FROM companies WHERE id=$1", [session.companyId]) : [])[0];
  const plan = company && company.subscription_plan in plans ? plans[company.subscription_plan] : plans.starter;
  const warehouseLimit = plan.warehouseLimit;
  const canManageWarehouses = Boolean(session && ["owner", "admin"].includes(session.role));
  const atLimit = warehouseLimit !== null && warehouses.length >= warehouseLimit;
  const errorMessage = params.error === "warehouse-limit" ? `Your ${plan.name} plan allows ${warehouseLimit} warehouse${warehouseLimit === 1 ? "" : "s"}. Upgrade the plan before adding another.` : params.error === "warehouse-duplicate" ? "That warehouse code already exists in this company." : params.error === "warehouse-invalid" ? "Check the warehouse code, name, and timezone." : params.error === "duplicate" ? "That location code already exists in this warehouse." : params.error ? "Please check the location details." : null;

  return <div className="app-content">
    <div className="page-heading"><div><h1>Warehouse setup</h1><p>Create physical warehouse facilities, then configure their scannable operational and storage locations.</p></div><Link href="/app/billing" className="button button-secondary">Review plan</Link></div>
    {params.warehouseCreated && <div className="success-banner">Warehouse created successfully. You can now add its receiving and storage locations.</div>}
    {params.created && <div className="success-banner">Location created successfully.</div>}
    {errorMessage && <div className="form-error">{errorMessage}</div>}
    {atLimit && <div className="warehouse-limit-banner" role="alert"><div><strong>{plan.name} warehouse limit reached</strong><span>This plan allows {warehouseLimit} warehouse{warehouseLimit === 1 ? "" : "s"}. Upgrade to create another facility.</span></div><Link href="/app/billing" className="button button-primary">Review upgrade options</Link></div>}
    <section className="panel">
      <div className="panel-heading"><div><h2>Warehouses</h2><p>{warehouses.length} of {warehouseLimit ?? "custom"} allowed on the {plan.name} plan.</p></div><span className={`badge ${atLimit ? "warn" : ""}`}>{atLimit ? "Limit reached" : "Capacity available"}</span></div>
      <div className="admin-table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Warehouse</th><th>Timezone</th><th>Status</th></tr></thead><tbody>{warehouses.map(warehouse => <tr key={warehouse.id}><td><strong>{warehouse.code}</strong></td><td>{warehouse.name}</td><td>{warehouse.timezone}</td><td><span className="badge">{warehouse.active ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table></div>
    </section>
    <div className="form-layout">
      <section className="panel"><h2>Locations</h2><div className="admin-table-wrap"><table className="data-table"><thead><tr><th>Warehouse</th><th>Location</th><th>Type</th><th>Status</th></tr></thead><tbody>{locations.length ? locations.map(location => <tr key={location.id}><td>{location.warehouse_name}</td><td><strong>{location.code}</strong></td><td>{location.type}</td><td><span className="badge">Active</span></td></tr>) : <tr><td colSpan={4} className="empty-cell">Create a receiving or storage location to begin.</td></tr>}</tbody></table></div></section>
      <aside className="panel">
        <h2>Add warehouse</h2>
        {canManageWarehouses ? <form className="form-stack compact-form" method="post" action="/api/warehouses"><div className="field"><label htmlFor="warehouseCode">Warehouse code</label><input id="warehouseCode" name="code" placeholder="e.g. CEB" required disabled={atLimit} /></div><div className="field"><label htmlFor="warehouseName">Warehouse name</label><input id="warehouseName" name="name" placeholder="e.g. Cebu Distribution Center" required disabled={atLimit} /></div><div className="field"><label htmlFor="timezone">Timezone</label><input id="timezone" name="timezone" defaultValue="Asia/Manila" required disabled={atLimit} /></div>{atLimit && warehouseLimit !== null ? <WarehouseLimitPrompt planName={plan.name} warehouseLimit={warehouseLimit} /> : <button className="button button-primary" type="submit">Create warehouse</button>}</form> : <p className="form-note">Only company owners and administrators can add warehouses.</p>}
        <h2>Create location</h2>
        <form className="form-stack compact-form" method="post" action="/api/locations"><div className="field"><label htmlFor="warehouseId">Warehouse</label><select id="warehouseId" name="warehouseId" required>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}</select></div><div className="field"><label htmlFor="code">Location code</label><input id="code" name="code" placeholder="e.g. REC-01 or A-01-02" required /></div><div className="field"><label htmlFor="type">Location type</label><select id="type" name="type"><option value="receiving">Receiving</option><option value="storage">Storage</option><option value="picking">Picking</option><option value="packing">Packing</option><option value="shipping">Shipping</option><option value="hold">Hold</option><option value="damaged">Damaged</option></select></div><button className="button button-primary" type="submit" disabled={!warehouses.length}>Create location</button></form>
      </aside>
    </div>
  </div>;
}
