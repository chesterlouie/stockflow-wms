const statuses=[['Draft','The PO can still be reviewed and lines can be added. It has not created receiving work.'],['Open','The PO was released and its expected receipts are available to receiving.'],['Partial','Some, but not all, ordered quantity has been inspected and posted.'],['Received','Every line has reached its ordered quantity.'],['Cancelled','The PO is closed without further receiving.']];

export default function ModuleFour(){return <section className="panel" id="module-4">
  <div className="panel-heading"><div><p className="eyebrow">Module 4</p><h2>Supplier Master and Purchasing</h2><p>Goal: control who the company buys from, then create an approved expectation of what stock should arrive, where, and when.</p></div><span className="badge">Current lesson</span></div>

  <h3>What is Supplier Master?</h3>
  <p>Supplier Master is the company-controlled list of approved vendors. Purchasing, dock scheduling, returns, reports, and ERP purchase-order integrations reference these records instead of accepting uncontrolled supplier names.</p>
  <div className="knowledge-note"><strong>Control principle:</strong> create or change a supplier in <strong>Master data → Supplier master</strong>. Purchasing can select only suppliers whose status is Active.</div>

  <h3>Step 1: Add an approved supplier</h3>
  <p>Open <strong>Master data → Supplier master</strong> and create this practice supplier:</p>
  <table className="data-table"><tbody><tr><th>Code</th><td>TRAIN-SUP</td></tr><tr><th>Name</th><td>Training Beverage Supplier</td></tr><tr><th>Email</th><td>An optional address you control</td></tr><tr><th>Phone</th><td>Optional</td></tr></tbody></table>
  <p>Supplier codes are unique inside the company and automatically converted to uppercase. Use a stable code that can also be used by ERP integrations. Do not create duplicates for spelling variations.</p>

  <h3>Supplier status controls</h3>
  <table className="data-table"><thead><tr><th>Status</th><th>Effect</th></tr></thead><tbody><tr><td><strong>Active</strong></td><td>Available for new purchase orders, PO imports, dock appointments, and integrations.</td></tr><tr><td><strong>Blocked</strong></td><td>Cannot be selected for new controlled transactions. Existing POs, receipts, reports, and audit history remain unchanged.</td></tr></tbody></table>
  <p>Use Block when a supplier is temporarily suspended, inactive, or no longer approved. Reactivate it only after the company’s approval process is complete. Creation and status changes are written to the audit log.</p>

  <h3>Step 2: Create a draft purchase order</h3>
  <p>Open <strong>Inbound → Purchase orders</strong>. The supplier selector shows only Active Supplier Master records. Enter:</p>
  <table className="data-table"><tbody><tr><th>PO number</th><td>TRAIN-PO-001</td></tr><tr><th>Supplier</th><td>TRAIN-SUP — Training Beverage Supplier</td></tr><tr><th>Warehouse</th><td>Your active training warehouse</td></tr><tr><th>Expected date</th><td>A future practice date</td></tr></tbody></table>
  <p>PO numbers must be unique inside the company. A new PO starts in <strong>Draft</strong> status. If no active supplier exists, Warevanta directs the user to Supplier Master before allowing PO creation.</p>

  <h3>Step 3: Add the item line</h3>
  <p>Open the PO and add <strong>TRAIN-COLA-330</strong>. Enter either <strong>48 EA</strong> or <strong>2 CASE</strong>. Because Item Master says 1 CASE = 24 EA, Warevanta normalizes 2 CASE to 48 EA.</p>
  <div className="knowledge-note"><strong>Before release:</strong> confirm the supplier, warehouse, item, quantity, unit, and expected date. Released POs feed live receiving work.</div>

  <h3>Step 4: Release to receiving</h3>
  <p>Select <strong>Release to receiving</strong>. If a purchase-order approval rule applies, the PO first appears in Approvals. Otherwise, Warevanta changes it to Open immediately.</p>
  <p>Release creates an expected inbound receipt for each PO line. Its receipt number combines the PO number and line number, for example <code>TRAIN-PO-001-01</code>. Receiving staff can then inspect and receive against this expectation.</p>

  <h3>PO statuses</h3>
  <table className="data-table"><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody>{statuses.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td></tr>)}</tbody></table>

  <h3>How receiving updates the PO</h3>
  <p>The PO’s received quantity includes accepted, held, and damaged quantities recorded during inspection. A partly processed line becomes Partial. When every line reaches its ordered quantity, the PO becomes Received.</p>
  <p>This does not mean held or damaged stock is available for orders. Those quantities remain in controlled locations and are excluded from ATP.</p>

  <h3>Over-receipt control</h3>
  <p>The item’s receiving rule determines how much can be received beyond the expected quantity. With a 5% tolerance on 48 EA, the maximum cumulative inspected quantity is 50.4 EA. Warevanta blocks quantities above the allowance.</p>

  <h3>Controlled CSV import</h3>
  <p>Use <strong>Inbound → PO import</strong> for many POs. The required columns are:</p>
  <pre className="knowledge-command">po_no,supplier_code,warehouse_code,expected_date,sku,quantity,uom</pre>
  <ul><li>Repeat the PO number on every line belonging to that PO.</li><li>Supplier codes must already exist and be Active in Supplier Master.</li><li>The import cannot create suppliers or change supplier names.</li><li>Warehouse codes and SKUs must already exist and be Active.</li><li>Imported POs remain Draft for review.</li><li>If a supplier is missing or blocked—or any line is invalid—the entire file rolls back.</li><li>The maximum upload size is 5 MB.</li></ul>

  <h3>Who can maintain suppliers and purchasing?</h3>
  <table className="data-table"><thead><tr><th>Role</th><th>Access</th></tr></thead><tbody><tr><td>Owner / Administrator</td><td>Maintain Supplier Master and perform all purchasing controls.</td></tr><tr><td>Manager</td><td>Maintain suppliers, create/import POs, add lines, and release POs.</td></tr><tr><td>Operator</td><td>No Supplier Master or purchasing maintenance. Work normally starts from released receiving tasks.</td></tr><tr><td>Viewer</td><td>No Supplier Master or purchasing maintenance.</td></tr></tbody></table>

  <h3>Common mistakes</h3>
  <ul><li>Trying to add a supplier from Purchase Orders instead of Supplier Master.</li><li>Creating duplicate supplier codes for spelling variations.</li><li>Using a blocked supplier code in a CSV or ERP request.</li><li>Reusing an existing PO number.</li><li>Choosing the wrong destination warehouse.</li><li>Adding an incorrect UOM or forgetting its Item Master conversion.</li><li>Releasing a PO before checking its lines.</li><li>Assuming Received means all quantities are available stock.</li><li>Importing warehouse codes or SKUs that do not exist.</li></ul>

  <h3>Practice checklist</h3>
  <ul className="knowledge-checklist"><li>Open Master data → Supplier master</li><li>Create supplier TRAIN-SUP</li><li>Confirm it appears as Active</li><li>Create draft PO TRAIN-PO-001 using that supplier</li><li>Add TRAIN-COLA-330 for 2 CASE or 48 EA</li><li>Verify the normalized quantity</li><li>Release the PO to receiving</li><li>Find the generated expected receipt in Receiving</li><li>Do not receive it yet; that is Module 5</li></ul>
  <div className="knowledge-checkpoint"><strong>Module 4 checkpoint</strong><p>Explain why suppliers belong in Master Data, what blocking a supplier changes, and why imports must not create suppliers automatically.</p></div>
</section>}
