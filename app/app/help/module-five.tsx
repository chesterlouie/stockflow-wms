const statuses=[['Expected','Nothing has been posted yet.'],['Partial','Some quantity was posted and a balance remains.'],['Inspected','Expected quantity has been classified as accepted, held, or damaged.'],['Putaway','Accepted inventory is awaiting movement to storage.'],['Completed','Required accepted-stock putaway is finished.']];

export default function ModuleFive(){return <section className="panel" id="module-5">
  <div className="panel-heading"><div><p className="eyebrow">Module 5</p><h2>Receiving, Inspection, and Putaway</h2><p>Goal: verify what arrived, classify its condition, record traceability, and move accepted stock into storage.</p></div><span className="badge">Current lesson</span></div>
  <h3>The inbound flow</h3>
  <pre className="knowledge-tree">Expected receipt → Receiving-label scan → Item-barcode scan{`\n`}→ Inspection → Accepted / Hold / Damaged → Putaway → Available storage</pre>
  <h3>Open the expected receipt</h3>
  <p>Open <strong>Inbound → Receiving</strong> and select <code>TRAIN-PO-001-01</code>. Review expected, received, remaining, tracking, tolerance, and status.</p>
  <h3>Receiving labels: purpose, timing, and ownership</h3>
  <p>The Warevanta receiving label is an <strong>internal warehouse label</strong>. It identifies an expected receipt and lets a receiver open the correct mobile task quickly. It does not replace the product barcode and does not have to come from the supplier.</p>
  <table className="data-table"><thead><tr><th>Question</th><th>Operating rule</th></tr></thead><tbody>
    <tr><td><strong>When is it printed?</strong></td><td>Normally after the PO is released to receiving and before the delivery is processed. It may also be printed when an unlabelled shipment arrives.</td></tr>
    <tr><td><strong>Who prints it?</strong></td><td>The receiving supervisor, receiving clerk, gate/check-in staff, or another authorized warehouse user.</td></tr>
    <tr><td><strong>Where is it printed?</strong></td><td>At the receiving office, gate desk, dock workstation, or a network/mobile thermal-label printer near the dock.</td></tr>
    <tr><td><strong>Where is it attached?</strong></td><td>To delivery paperwork, a pallet, tote, or temporary receiving container—not normally to every individual product.</td></tr>
    <tr><td><strong>What does it encode?</strong></td><td>The Warevanta receipt number used to find the expected receiving task.</td></tr>
  </tbody></table>
  <h3>Supplier labels and internal labels</h3>
  <div className="knowledge-definitions"><p><strong>Supplier label</strong><br/>May identify a product, carton, pallet, SSCC, ASN, or supplier delivery reference. It can be used when its value is registered or integrated with Warevanta.</p><p><strong>Warevanta receiving label</strong><br/>Identifies the internal expected receipt. Print it when supplier labels are missing, incompatible, or do not identify the Warevanta task.</p><p><strong>Item barcode</strong><br/>Identifies the SKU or pack size and confirms that the physical item matches the receipt line.</p><p><strong>Location label</strong><br/>Identifies a receiving, storage, hold, damaged, or other warehouse location during movement confirmation.</p></div>
  <div className="knowledge-note"><strong>Two different scans:</strong> scan the receiving-label QR code to find the task, then scan the product&apos;s item barcode in Confirm item barcode. Scanning the receiving label in the item field will be rejected.</div>
  <h3>Print and use the receiving label</h3>
  <ol><li>Release the purchase order to receiving.</li><li>Open <strong>Inbound → Receiving</strong> and select the expected receipt.</li><li>Select <strong>Receiving label</strong> and use the browser&apos;s Print command.</li><li>Attach the label to the paperwork, pallet, tote, or temporary container.</li><li>On the phone, open <strong>Mobile receiving</strong> and scan the label to find the task.</li><li>Open the task and scan the separate item barcode before posting quantities.</li></ol>
  <h3>Classify the delivery</h3>
  <table className="data-table"><thead><tr><th>Quantity</th><th>Meaning</th></tr></thead><tbody><tr><td><strong>Accepted</strong></td><td>Usable stock enters Receiving and creates a putaway task to Storage.</td></tr><tr><td><strong>Hold</strong></td><td>Stock needing investigation goes to a Hold location and is unavailable.</td></tr><tr><td><strong>Damaged</strong></td><td>Unusable stock goes to a Damaged location and is unavailable.</td></tr></tbody></table>
  <p>You can post a partial delivery and return later for the balance.</p>
  <h3>Record traceability</h3>
  <p>For <code>TRAIN-COLA-330</code>, enter lot <code>LOT-TRAIN-001</code> and an expiry at least 30 days ahead. Warevanta rejects missing or insufficient tracking data. Serial-tracked items require one unique serial per received unit.</p>
  <h3>Choose locations</h3>
  <ul><li>Receiving must use a Receiving location such as RCV-01.</li><li>Suggested storage must use a Storage location such as A-01-01.</li><li>A Hold location is required when Hold quantity is above zero.</li><li>A Damaged location is required when Damaged quantity is above zero.</li></ul>
  <h3>Practice receipt</h3>
  <table className="data-table"><tbody><tr><th>Accepted</th><td>48</td></tr><tr><th>Hold / damaged</th><td>0 / 0</td></tr><tr><th>Receiving / storage</th><td>RCV-01 / A-01-01</td></tr><tr><th>Lot</th><td>LOT-TRAIN-001</td></tr><tr><th>Expiry</th><td>At least 30 days from today</td></tr></tbody></table>
  <div className="knowledge-note"><strong>Posting is a real inventory event:</strong> verify quantities, locations, lot, and expiry before selecting Post receipt.</div>
  <h3>Over-receipt behavior</h3>
  <p>Warevanta checks cumulative inspected quantity against expected quantity plus tolerance. With 48 EA expected and 5% tolerance, no more than 50.4 EA can be posted.</p>
  <h3>Complete putaway</h3>
  <p>Accepted stock creates a task from RCV-01 to A-01-01. On desktop, select <strong>Confirm putaway</strong>. On Mobile putaway, scan the source location, item barcode, and assigned destination, then confirm.</p>
  <p>Putaway creates equal out and in movements: stock leaves Receiving and enters Storage without changing total company inventory.</p>
  <h3>Mobile receiving</h3>
  <p>Scan a receipt label, PO, SKU, or barcode to find the task. Scan the expected item barcode before posting quantities and tracking data. A barcode belonging to another SKU is rejected.</p>
  <h3>Receipt statuses</h3>
  <table className="data-table"><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody>{statuses.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td></tr>)}</tbody></table>
  <h3>Common mistakes</h3>
  <ul><li>Using the receiving-label QR code in the item-barcode field.</li><li>Accepting units that should be held or damaged.</li><li>Choosing the wrong location type.</li><li>Using the supplier name instead of the actual lot.</li><li>Using an expiry below minimum shelf life.</li><li>Posting the same delivery twice.</li><li>Assuming stock is in Storage before putaway.</li></ul>
  <h3>Practice checklist</h3>
  <ul className="knowledge-checklist"><li>Open TRAIN-PO-001-01</li><li>Print or display its receiving label</li><li>Scan the receipt label to find the mobile task</li><li>Scan the separate expected item barcode</li><li>Post 48 accepted, 0 held, and 0 damaged</li><li>Enter LOT-TRAIN-001 and a valid expiry</li><li>Review receipt history and the putaway task</li><li>Complete RCV-01 to A-01-01 putaway</li><li>Confirm PO and receipt progress</li></ul>
  <div className="knowledge-checkpoint"><strong>Module 5 checkpoint</strong><p>Explain the difference between a supplier label, Warevanta receiving label, item barcode, and location label—and when each one is scanned.</p></div>
</section>}
