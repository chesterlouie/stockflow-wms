const labels=[['Receipt label','Receipt number','Find and open an expected inbound task.'],['Item label','Registered item barcode','Confirm the correct SKU or pack.'],['Location label','Warehouse location code','Confirm the physical source or destination.'],['Carton / shipment label','Carton, shipment, or tracking reference','Verify packing and dispatch handling units.']];
const formats=[['Code 128','Common internal item and warehouse labels'],['EAN-13 / EAN-8','Retail and manufacturer item barcodes'],['UPC-A / UPC-E','Retail item barcodes'],['QR Code','Receipt, shipment, and general two-dimensional labels'],['Data Matrix','Compact two-dimensional product identifiers'],['GS1 DataBar','Structured retail and logistics identifiers']];

export default function ModuleSeven(){return <section className="panel" id="module-7">
  <div className="panel-heading"><div><p className="eyebrow">Module 7</p><h2>Mobile Scanning</h2><p>Goal: use an ordinary smartphone as a controlled warehouse scanner and understand what every scan is expected to prove.</p></div><span className="badge">Current lesson</span></div>
  <h3>What mobile scanning does</h3>
  <p>Warevanta adds a <strong>Scan with camera</strong> button beside supported fields on phones. The rear camera reads the symbol, inserts its value into the correct field, and leaves the operator in control of the final transaction.</p>
  <pre className="knowledge-tree">Find task → Confirm location → Confirm item{`\n`}→ Enter quantity / tracking → Review → Post</pre>
  <h3>Local mobile prerequisites</h3>
  <ol><li>Keep the Warevanta computer running.</li><li>Connect the phone and computer to the same Wi-Fi network.</li><li>Open the computer&apos;s current HTTPS LAN address on the phone.</li><li>Install and fully trust the local Caddy certificate only on devices you control.</li><li>Allow Camera permission for the Warevanta site.</li><li>Disable a VPN, Private Relay, or Wi-Fi client isolation if it prevents local-device access.</li></ol>
  <div className="knowledge-note"><strong>Network addresses can change:</strong> if the computer joins another network, confirm its new LAN address and update the local HTTPS gateway before testing.</div>
  <h3>Know which label to scan</h3>
  <table className="data-table"><thead><tr><th>Label</th><th>Encoded value</th><th>Purpose</th></tr></thead><tbody>{labels.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td><td>{x[2]}</td></tr>)}</tbody></table>
  <div className="knowledge-note"><strong>Critical distinction:</strong> a receiving-label QR code finds the receipt task. It does not confirm the item. The Confirm item barcode field requires a barcode registered against the expected SKU in Item Master.</div>
  <h3>Supported camera formats</h3>
  <table className="data-table"><thead><tr><th>Format</th><th>Typical use</th></tr></thead><tbody>{formats.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td></tr>)}</tbody></table>
  <p>Use <strong>Item Master → Print label</strong> to create screen-ready or printable item labels. A phone cannot scan a barcode displayed on its own screen; use another screen or a printed label.</p>
  <h3>Mobile receiving: the two-scan workflow</h3>
  <ol><li>Open <strong>Mobile work → Mobile receiving</strong>.</li><li>Scan the receiving label, PO number, SKU, or registered item barcode to find the open task.</li><li>Open the matching task and review expected and remaining quantity.</li><li>In <strong>Confirm item barcode</strong>, scan the separate item label.</li><li>Classify accepted, hold, and damaged quantities.</li><li>Select the required location for every non-zero classification.</li><li>Enter lot, expiry, or serial information required by the Item Master.</li><li>Review every value, then post the receipt.</li></ol>
  <h3>Practice with TRAIN-COLA-330</h3>
  <table className="data-table"><tbody><tr><th>EA item barcode</th><td><code>00000002</code></td></tr><tr><th>CASE barcode</th><td><code>TRAIN-COLA-CASE-24</code></td></tr><tr><th>Receipt label</th><td>The receipt number, such as <code>TRAIN-PO-002-01</code></td></tr><tr><th>Tracking</th><td>Lot + expiry, with at least 30 days remaining</td></tr></tbody></table>
  <p>Both registered barcodes confirm the TRAIN-COLA-330 item. The current mobile receiving quantity fields remain in the receipt line&apos;s displayed UOM; scanning a CASE label does <strong>not</strong> automatically add 24 EA. Review and enter the intended transaction quantity explicitly.</p>
  <h3>GS1 scanning</h3>
  <p>When a supported GS1 symbol contains an item identifier, lot, expiry, or serial, Warevanta parses those elements. In supported forms it uses the item identifier for validation and can fill empty lot, expiry, and serial fields. Always review the populated values before posting.</p>
  <h3>Mobile putaway</h3>
  <p>A putaway task requires three confirmations in sequence:</p>
  <ol><li>Scan the assigned Receiving source location.</li><li>Scan a barcode registered to the assigned item.</li><li>Scan the assigned Storage destination location.</li></ol>
  <p>Warevanta rejects a source, item, or destination that does not match the task. Confirm only after the stock is physically ready to move.</p>
  <h3>Mobile pick and pack</h3>
  <ul><li><strong>Pick:</strong> scan the assigned source location and item barcode.</li><li><strong>Pack:</strong> scan the packing destination, select an open carton, and scan the item barcode.</li><li><strong>Short pick:</strong> report the exception instead of confirming inventory that is missing, damaged, wrong, or inaccessible.</li></ul>
  <h3>Mobile dispatch and dock work</h3>
  <ul><li>Dispatch verifies the packing location, carrier, and tracking/reference before inventory leaves the warehouse.</li><li>Gate and dock check-in can find work using appointment, vehicle, or dock references and advances the appointment through its permitted status sequence.</li></ul>
  <h3>Camera technique</h3>
  <ul><li>Use the rear camera in good, even light.</li><li>Keep the full barcode and its quiet white margins inside the frame.</li><li>Avoid glare, folds, screen reflections, and very low brightness.</li><li>Hold steady, then move slowly closer or farther away.</li><li>For long Code 128 labels, hold the phone horizontally if needed.</li><li>Use the flashlight control when the device and browser support it.</li></ul>
  <h3>Connectivity behavior</h3>
  <p>The Online pill confirms browser connectivity. Warevanta can preserve draft scan-field values on the phone, but inventory posting still requires a live connection to the local server and database. Do not assume a transaction posted until a success message appears and the queue or balance refreshes.</p>
  <h3>Safe mobile test sequence</h3>
  <ol><li>First type the expected barcode manually to confirm transaction logic.</li><li>Then display the same generated label on another screen and test the camera.</li><li>Scan a wrong item barcode and confirm Warevanta rejects it.</li><li>Scan the receipt label into the item field and confirm it is rejected.</li><li>Test valid lot and expiry, then deliberately test a missing or short shelf-life value.</li><li>Test accepted-only, then accepted plus hold or damaged with the required locations.</li><li>Verify inventory, receipt history, and the resulting putaway task after each successful post.</li></ol>
  <h3>Common mistakes</h3>
  <ul><li>Using the receipt label in the item-confirmation field.</li><li>Scanning a label from the phone&apos;s own screen.</li><li>Assuming a successful scan means the inventory transaction was posted.</li><li>Ignoring the displayed task, lot, expiry, location, or quantity after scanning.</li><li>Expecting a CASE scan to change the quantity automatically.</li><li>Posting while offline or after the local computer has stopped.</li><li>Blocking camera access or testing through an untrusted local HTTPS connection.</li></ul>
  <h3>Practice checklist</h3>
  <ul className="knowledge-checklist"><li>Open Warevanta from the phone using the current LAN HTTPS address</li><li>Allow rear-camera access</li><li>Print or display the TRAIN-COLA-330 EA label</li><li>Scan a receiving label to find an inbound task</li><li>Scan 00000002 to confirm the item</li><li>Complete a valid lot-and-expiry receipt</li><li>Verify an incorrect barcode is rejected</li><li>Complete a source-item-destination putaway scan</li><li>Confirm the final balance in Inventory Availability</li></ul>
  <div className="knowledge-checkpoint"><strong>Module 7 checkpoint</strong><p>Explain why finding a task, confirming an item, and confirming a location require different barcode values—and why a successful scan is not yet a posted inventory transaction.</p></div>
</section>}
