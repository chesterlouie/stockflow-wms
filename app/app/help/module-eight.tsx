const statuses=[['New','Order and lines can still be reviewed or extended.'],['Allocated','Inventory is reserved and guided pick tasks exist.'],['Picking','At least one pick is complete while other picks remain.'],['Picked','All assigned picks are complete at the packing location.'],['Packing','Some picked tasks are verified into cartons.'],['Packed','All tasks are verified into cartons and ready for sealing/dispatch controls.'],['Dispatched','Shipment is confirmed and inventory has left the warehouse.']];

export default function ModuleEight(){return <section className="panel" id="module-8">
  <div className="panel-heading"><div><p className="eyebrow">Module 8</p><h2>Orders, Picking, Packing, and Dispatch</h2><p>Goal: turn customer demand into reserved work, verify every physical movement, and issue inventory only when a sealed shipment leaves the warehouse.</p></div><span className="badge">Current lesson</span></div>
  <h3>The outbound lifecycle</h3>
  <pre className="knowledge-tree">Sales order → Allocate → Pick → Pack into carton{`\n`}→ Seal carton → Dispatch → Shipment history</pre>
  <h3>Create a training sales order</h3>
  <p>Open <strong>Outbound → Orders</strong> and create:</p>
  <table className="data-table"><tbody><tr><th>Order number</th><td>TRAIN-SO-001</td></tr><tr><th>Customer</th><td>Training Customer</td></tr><tr><th>Warehouse</th><td>The warehouse holding TRAIN-COLA-330</td></tr><tr><th>Item</th><td>TRAIN-COLA-330</td></tr><tr><th>Quantity / UOM</th><td>6 / EA</td></tr><tr><th>Priority</th><td>Normal</td></tr><tr><th>Requested ship date</th><td>A future training date</td></tr></tbody></table>
  <p>A unique order number is required. Use the base UOM for this exercise. While the order is New, open it to add more lines if required. Review the customer, warehouse, items, quantities, priority, and date before release.</p>
  <h3>Release and allocate</h3>
  <p>Select <strong>Release and allocate all lines</strong>. Warevanta reserves matching inventory from Storage or Picking locations, follows the item allocation method, and creates pick tasks to an active Packing location.</p>
  <ul><li>FIFO favors the oldest eligible stock.</li><li>FEFO favors the earliest-expiring eligible lot.</li><li>LIFO favors the newest eligible stock.</li><li>Existing allocations reduce what remains available for another order.</li><li>Every order line must have sufficient stock or allocation rolls back.</li><li>An active Packing location is required.</li></ul>
  <div className="knowledge-note"><strong>Reservation is not a physical movement:</strong> allocation increases Reserved and reduces ATP, but On hand does not change until warehouse work is executed.</div>
  <h3>Read the guided pick task</h3>
  <p>Each task states the quantity, UOM, item, exact source, Packing destination, lot, and expiry. A line can produce several tasks when its quantity must be supplied by multiple locations or lots.</p>
  <h3>Confirm picking</h3>
  <p>Use the order page or <strong>Mobile work → Pick &amp; pack → Pick queue</strong>. For every task:</p>
  <ol><li>Travel to the assigned source location.</li><li>Confirm the displayed SKU, lot, expiry, and quantity.</li><li>Scan the assigned source-location code.</li><li>Scan a barcode registered to the assigned item.</li><li>Physically move the quantity to the Packing location.</li><li>Select <strong>Confirm pick</strong>.</li></ol>
  <p>Picking creates a balanced movement: a negative entry at the source and an equal positive entry at Packing. Company on hand is unchanged.</p>
  <h3>Report a short pick</h3>
  <p>If stock is missing, damaged, wrong, or inaccessible, do not confirm a false pick. Open <strong>Cannot complete this pick?</strong>, select the reason, add a useful note, and report the exception for manager resolution.</p>
  <h3>Create the packing carton</h3>
  <p>Before mobile packing, open <strong>Outbound → Packing cartons</strong>. Create an open carton for the same order using a unique identifier such as <code>TRAIN-CTN-001</code>.</p>
  <div className="knowledge-note"><strong>Carton ownership:</strong> a carton belongs to one order. A pick task cannot be verified into a carton created for another order or into a carton that is already sealed.</div>
  <h3>Verify packing</h3>
  <p>Open the Pack queue. For every completed pick:</p>
  <ol><li>Scan the assigned Packing location.</li><li>Select an open carton belonging to the order.</li><li>Scan the item barcode again.</li><li>Place the physical quantity in that carton.</li><li>Select <strong>Verify into carton</strong>.</li></ol>
  <p>Packing verification links the picked task and quantity to the carton. It does not issue stock from the warehouse; inventory remains at the Packing location.</p>
  <h3>Seal and label the carton</h3>
  <p>Return to Packing cartons. An empty carton cannot be sealed. Enter actual weight, length, width, and height, then select <strong>Seal carton</strong>. Print the carton label and attach it to the correct physical carton.</p>
  <table className="data-table"><tbody><tr><th>Weight</th><td>Actual packed weight in kilograms</td></tr><tr><th>Dimensions</th><td>Actual length × width × height in centimeters</td></tr><tr><th>Carton label</th><td>Identifies carton, order, customer, contents, weight, and dimensions</td></tr></tbody></table>
  <h3>Dispatch the order</h3>
  <p>All tasks must be packed and all participating cartons must be sealed. In Mobile dispatch:</p>
  <ol><li>Open the packed order.</li><li>Scan the assigned Packing location.</li><li>Enter the carrier.</li><li>Scan or enter the tracking/reference number.</li><li>Verify the physical cartons and paperwork.</li><li>Select <strong>Confirm dispatch</strong>.</li></ol>
  <p>Dispatch creates the shipment, marks sealed cartons Dispatched, changes the order to Dispatched, updates shipped quantities, and posts a negative shipment issue from Packing. This is the point at which company on-hand inventory decreases.</p>
  <h3>Print and retain shipment evidence</h3>
  <p>After dispatch, open the shipment label. It includes the shipment number, order, customer, carrier, tracking reference, contents, origin, and dispatch time. Recent shipments remain available from Mobile dispatch for reprinting.</p>
  <h3>Order statuses</h3>
  <table className="data-table"><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody>{statuses.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td></tr>)}</tbody></table>
  <h3>Inventory effect by stage</h3>
  <table className="data-table"><thead><tr><th>Stage</th><th>On hand</th><th>Reserved / location effect</th></tr></thead><tbody><tr><td>Allocate</td><td>No change</td><td>Reserved increases; ATP decreases</td></tr><tr><td>Pick</td><td>No company-total change</td><td>Stock moves Source → Packing</td></tr><tr><td>Pack / seal</td><td>No change</td><td>Tasks are linked to sealed cartons</td></tr><tr><td>Dispatch</td><td>Decreases</td><td>Shipment issue removes stock from Packing</td></tr></tbody></table>
  <h3>Pick waves</h3>
  <p>Open <strong>Outbound → Pick waves</strong> to group all unassigned pending picks in a warehouse under a unique wave number. Waves organize work; the same location and item scan controls still apply to every task.</p>
  <h3>Operational responsibility</h3>
  <p>Owners, administrators, or managers normally review demand and release work. Operators normally execute picking, packing, sealing, and dispatch scans. Final role enforcement and separation-of-duties rules will be verified during production-readiness QA.</p>
  <h3>Common mistakes</h3>
  <ul><li>Allocating before checking the customer, warehouse, lines, and quantities.</li><li>Assuming Reserved stock has physically moved.</li><li>Picking from a convenient location instead of the assigned source.</li><li>Scanning the receipt label instead of the item barcode.</li><li>Confirming a short or damaged pick instead of reporting an exception.</li><li>Trying to pack before creating an open carton.</li><li>Selecting a carton belonging to another order.</li><li>Sealing an empty carton or entering estimated dimensions as actual measurements.</li><li>Dispatching before all cartons are sealed.</li><li>Using a vague carrier or tracking reference that cannot support delivery investigation.</li></ul>
  <h3>Practice checklist</h3>
  <ul className="knowledge-checklist"><li>Create TRAIN-SO-001 for 6 EA of TRAIN-COLA-330</li><li>Review ATP before allocation</li><li>Release and allocate all lines</li><li>Confirm Reserved increased while company on hand stayed unchanged</li><li>Complete the assigned source-location and item scans</li><li>Create carton TRAIN-CTN-001</li><li>Verify picked stock into that carton</li><li>Enter actual measurements and seal the carton</li><li>Print or display the carton label</li><li>Dispatch with a packing-location scan, carrier, and tracking reference</li><li>Review the shipment label and shipment-issue movement</li><li>Confirm final order, carton, and inventory statuses</li></ul>
  <div className="knowledge-checkpoint"><strong>Module 8 checkpoint</strong><p>Explain when Reserved changes, when stock physically moves to Packing, and the exact event that reduces company on-hand inventory.</p></div>
</section>}
