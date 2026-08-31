import Link from 'next/link';

export default async function Import({searchParams}:{searchParams:Promise<{imported?:string;error?:string}>}){
  const q=await searchParams;
  return <div className="app-content">
    <div className="page-heading"><div><h1>Import purchase orders</h1><p>Upload controlled multi-line PO data from an ERP or spreadsheet.</p></div><Link href="/app/purchasing" className="button button-secondary">Back to purchasing</Link></div>
    {q.imported&&<div className="success-banner">Imported {q.imported} draft purchase order(s).</div>}
    {q.error&&<div className="form-error">Import failed: {q.error.replaceAll('_',' ')}. No partial import was saved.</div>}
    <div className="form-layout"><section className="panel"><h2>CSV upload</h2><form className="form-stack" method="post" action="/api/imports/purchase-orders" encType="multipart/form-data"><div className="field"><label>Purchase order CSV</label><input name="file" type="file" accept=".csv,text/csv" required/></div><button className="button button-primary">Validate and import</button></form></section><aside className="panel"><h2>Required columns</h2><code>po_no,supplier_code,warehouse_code,expected_date,sku,quantity,uom</code><ul className="help-list"><li>Repeat the PO number for each line.</li><li>Supplier codes must already exist and be active in Supplier Master.</li><li>Warehouse codes and item SKUs must already exist and be active.</li><li>Imports create draft POs for review before release.</li><li>The entire file rolls back if any line is invalid.</li></ul><Link className="table-link" href="/app/suppliers">Open Supplier Master</Link></aside></div>
  </div>;
}
