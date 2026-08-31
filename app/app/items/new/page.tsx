import Link from "next/link";
import { getSession } from "../../../../lib/auth";
import { tenantRows } from "../../../../lib/db";

export const metadata = { title: "New item" };

export default async function NewItem({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await getSession();
  const categories = session ? await tenantRows<{ name: string }>(session.companyId, "SELECT name FROM item_categories WHERE company_id=$1 AND active=true ORDER BY name", [session.companyId]) : [];
  return <div className="app-content">
    <div className="page-heading"><div><h1>Create item</h1><p>Define the SKU, handling rules, and barcode identifiers.</p></div><Link href="/app/items" className="button button-secondary">Cancel</Link></div>
    {error && <div className="form-error">{error === "duplicate" ? "The SKU or barcode already exists in this company." : "Please check all required item fields."}</div>}
    <form className="form-layout" method="post" action="/api/items">
      <section className="panel form-section">
        <h2>Item details</h2>
        <div className="form-row"><div className="field"><label htmlFor="sku">SKU</label><input id="sku" name="sku" placeholder="e.g. 100845" required /></div><div className="field"><label htmlFor="status">Status</label><select id="status" name="status"><option value="active">Active</option><option value="blocked">Blocked</option><option value="discontinued">Discontinued</option></select></div></div>
        <div className="field"><label htmlFor="name">Item description</label><input id="name" name="name" placeholder="Product name and size" required /></div>
        <div className="form-row"><div className="field"><label htmlFor="category">Category</label><select id="category" name="category"><option value="">Uncategorized</option>{categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}</select><small className="form-note">Maintain choices under Master data → Categories.</small></div><div className="field"><label htmlFor="uom">Base unit</label><select id="uom" name="uom"><option value="EA">EA — Each</option><option value="CASE">CASE — Case</option><option value="KG">KG — Kilogram</option><option value="BAG">BAG — Bag</option></select></div></div>
        <h2>Barcode ID</h2>
        <div className="radio-group"><label className="radio-card"><input type="radio" name="barcodeMode" value="auto" defaultChecked /><span><strong>Auto-generate</strong><small>Continue from the latest company barcode for the selected retail format.</small></span></label><label className="radio-card"><input type="radio" name="barcodeMode" value="manual" /><span><strong>Manual or scan</strong><small>Enter an existing manufacturer or supplier barcode.</small></span></label></div>
        <div className="form-row"><div className="field"><label htmlFor="barcode">Barcode value</label><input id="barcode" name="barcode" placeholder="Generated when saved, or enter manually" /></div><div className="field"><label htmlFor="format">Barcode format</label><select id="format" name="format"><option value="ean13">EAN-13 retail</option><option value="upca">UPC-A retail</option><option value="code128">Code 128 internal</option><option value="qr">QR Code</option><option value="gs1">GS1</option></select></div></div>
        <p className="form-note">EAN-13 and UPC-A auto-generation increments the last barcode of the same format and recalculates its check digit. Only use a GS1 company prefix your business is authorized to issue.</p>
        <h2>Inventory rules</h2>
        <div className="form-row"><div className="field"><label htmlFor="tracking">Tracking</label><select id="tracking" name="tracking"><option value="none">None</option><option value="lot">Lot</option><option value="lot_expiry">Lot + expiry</option><option value="serial">Serial number</option></select></div><div className="field"><label htmlFor="allocation">Allocation method</label><select id="allocation" name="allocation"><option value="fifo">FIFO</option><option value="fefo">FEFO</option><option value="lifo">LIFO</option></select></div></div>
        <button className="button button-primary" type="submit">Save item</button>
      </section>
      <aside className="panel"><h2>Barcode rules</h2><ul className="help-list"><li>Barcode IDs must be unique within the company.</li><li>Multiple barcodes can be added for each, inner pack, case, or pallet.</li><li>Manual values may be typed or scanned using a phone or Bluetooth scanner.</li><li>Retail auto-generation follows the latest EAN-13 or UPC-A used by the company.</li><li>Labels can be printed after the item is saved.</li></ul></aside>
    </form>
  </div>;
}
