import { getSession } from "../../../lib/auth";
import { tenantRows } from "../../../lib/db";

export const metadata = { title: "Category master" };
export const dynamic = "force-dynamic";

type Category = { id: string; code: string; name: string; description: string | null; active: boolean; item_count: string };

export default async function Categories({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; error?: string }> }) {
  const session = await getSession();
  const params = await searchParams;
  const categories = session ? await tenantRows<Category>(session.companyId, `
    SELECT c.id,c.code,c.name,c.description,c.active,count(i.id)::text AS item_count
    FROM item_categories c
    LEFT JOIN items i ON i.company_id=c.company_id AND lower(i.category)=lower(c.name)
    WHERE c.company_id=$1
    GROUP BY c.id
    ORDER BY c.active DESC,c.name
  `, [session.companyId]) : [];
  const canManage = Boolean(session && ["owner", "admin", "manager"].includes(session.role));
  const errorMessage = params.error === "duplicate" ? "That category code or name already exists." : params.error ? "The category could not be saved. Check the required fields." : null;

  return <div className="app-content">
    <div className="page-heading"><div><h1>Category master</h1><p>Maintain the controlled product classifications available in Item Master.</p></div></div>
    {params.created && <div className="success-banner">Category created successfully and is ready for Item Master.</div>}
    {params.updated && <div className="success-banner">Category status updated.</div>}
    {errorMessage && <div className="form-error">{errorMessage}</div>}
    <div className="form-layout">
      <section className="panel">
        <div className="panel-heading"><div><h2>Categories</h2><p>{categories.filter((category) => category.active).length} active · {categories.length} total</p></div></div>
        <div className="admin-table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Category</th><th>Description</th><th>Items</th><th>Status</th><th>Control</th></tr></thead><tbody>{categories.length ? categories.map((category) => <tr key={category.id}><td><strong>{category.code}</strong></td><td>{category.name}</td><td>{category.description || "—"}</td><td>{category.item_count}</td><td><span className="badge">{category.active ? "Active" : "Inactive"}</span></td><td>{canManage ? <form method="post" action={`/api/categories/${category.id}/status`}><button className="signout-button" type="submit">{category.active ? "Deactivate" : "Activate"}</button></form> : "—"}</td></tr>) : <tr><td colSpan={6} className="empty-cell">No categories yet. Create the first product category.</td></tr>}</tbody></table></div>
      </section>
      <aside className="panel">
        <h2>Add category</h2>
        {canManage ? <form className="form-stack compact-form" method="post" action="/api/categories"><div className="field"><label htmlFor="categoryCode">Category code</label><input id="categoryCode" name="code" placeholder="e.g. BEV" required /></div><div className="field"><label htmlFor="categoryName">Category name</label><input id="categoryName" name="name" placeholder="e.g. Beverages" required /></div><div className="field"><label htmlFor="categoryDescription">Description</label><textarea id="categoryDescription" name="description" rows={3} placeholder="Optional classification guidance" /></div><button className="button button-primary" type="submit">Create category</button></form> : <p className="form-note">Only owners, administrators, and managers can maintain categories.</p>}
        <p className="form-note">Deactivating a category prevents new selection but does not change existing item records.</p>
      </aside>
    </div>
  </div>;
}
