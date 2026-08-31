import { getSession } from "../../../lib/auth";
import { tenantRows } from "../../../lib/db";

export const metadata = { title: "Supplier master" };
export const dynamic = "force-dynamic";

type Supplier = { id: string; code: string; name: string; email: string | null; phone: string | null; status: "active" | "blocked"; po_count: string };

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; error?: string }> }) {
  const session = await getSession();
  const params = await searchParams;
  const suppliers = session ? await tenantRows<Supplier>(session.companyId, `
    SELECT s.id,s.code,s.name,s.email,s.phone,s.status,count(p.id)::text AS po_count
    FROM suppliers s
    LEFT JOIN purchase_orders p ON p.company_id=s.company_id AND p.supplier_id=s.id
    WHERE s.company_id=$1
    GROUP BY s.id
    ORDER BY (s.status='active') DESC,s.name
  `, [session.companyId]) : [];
  const canManage = Boolean(session && ["owner", "admin", "manager"].includes(session.role));
  const errorMessage = params.error === "duplicate" ? "That supplier code already exists." : params.error ? "The supplier could not be saved. Check the required fields." : null;

  return <div className="app-content">
    <div className="page-heading"><div><h1>Supplier master</h1><p>Control the approved suppliers available to purchasing, receiving, docks, returns, and ERP integrations.</p></div></div>
    {params.created && <div className="success-banner">Supplier created and available for purchasing.</div>}
    {params.updated && <div className="success-banner">Supplier status updated.</div>}
    {errorMessage && <div className="form-error">{errorMessage}</div>}
    <div className="form-layout">
      <section className="panel">
        <div className="panel-heading"><div><h2>Suppliers</h2><p>{suppliers.filter((supplier) => supplier.status === "active").length} active · {suppliers.length} total</p></div></div>
        <div className="admin-table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Supplier</th><th>Contact</th><th>POs</th><th>Status</th><th>Control</th></tr></thead><tbody>{suppliers.length ? suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.code}</strong></td><td>{supplier.name}</td><td>{supplier.email || supplier.phone ? <>{supplier.email || "—"}<br/><small>{supplier.phone || ""}</small></> : "—"}</td><td>{supplier.po_count}</td><td><span className="badge">{supplier.status === "active" ? "Active" : "Blocked"}</span></td><td>{canManage ? <form method="post" action={`/api/suppliers/${supplier.id}/status`}><button className="signout-button" type="submit">{supplier.status === "active" ? "Block" : "Activate"}</button></form> : "—"}</td></tr>) : <tr><td colSpan={6} className="empty-cell">No suppliers yet. Add the first approved supplier.</td></tr>}</tbody></table></div>
      </section>
      <aside className="panel">
        <h2>Add supplier</h2>
        {canManage ? <form className="form-stack compact-form" method="post" action="/api/suppliers"><div className="field"><label htmlFor="supplierCode">Supplier code</label><input id="supplierCode" name="code" placeholder="e.g. TRAIN-SUP" required/></div><div className="field"><label htmlFor="supplierName">Supplier name</label><input id="supplierName" name="name" required/></div><div className="field"><label htmlFor="supplierEmail">Email</label><input id="supplierEmail" name="email" type="email"/></div><div className="field"><label htmlFor="supplierPhone">Phone</label><input id="supplierPhone" name="phone"/></div><button className="button button-primary" type="submit">Create supplier</button></form> : <p className="form-note">Only owners, administrators, and managers can maintain suppliers.</p>}
        <p className="form-note">Blocking a supplier prevents new purchase orders and integrations from selecting it. Historical transactions remain unchanged.</p>
      </aside>
    </div>
  </div>;
}
