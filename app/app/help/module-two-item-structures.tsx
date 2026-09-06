const itemTypes=[['Standard','A normal independently stocked and fulfilled SKU.'],['Spare part','A service or replacement component managed as its own SKU, stock balance, barcode, and traceability record.'],['Virtual kit','A sellable grouping that is not stocked as a finished item. Allocation explodes demand into its required components.'],['Stocked kit','A preassembled kit held and fulfilled as finished inventory. Its components document the structure but are not exploded during allocation.']];
const relationships=[['One-way substitute','The target may replace the source, but the source does not automatically replace the target.'],['Reciprocal substitute','Either item may replace the other. Warevanta creates the reverse relationship with the inverse conversion ratio.'],['Superseded by','The target is the intended successor to the source item.'],['Compatible with','Documents compatibility only; it is not used for automatic allocation.']];

export default function ModuleTwoItemStructures(){return <section className="panel" id="module-2-item-structures">
  <p className="eyebrow">Module 2 extension</p>
  <h2>Spare Parts, Kits, and Item Relationships</h2>
  <p>Item type controls how Warevanta interprets an SKU during fulfillment. Select it when creating the item, then open the saved Item Master record to configure components and relationships.</p>
  <table className="data-table"><thead><tr><th>Item type</th><th>Operational behavior</th></tr></thead><tbody>{itemTypes.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td></tr>)}</tbody></table>

  <h3>Before adding VKit components</h3>
  <ul><li>Create every physical component as its own active Standard or Spare part SKU.</li><li>Create the sellable parent SKU with Item type <strong>Virtual kit (components allocated)</strong>.</li><li>Sign in as an <strong>Owner, Administrator, or Manager</strong>. Operators and Viewers may not maintain kit structures.</li></ul>
  <div className="knowledge-note"><strong>Why the component form may be missing:</strong> <em>Add or update component</em> appears only for Virtual kit and Stocked kit records and only for an authorized role. If the page shows only “No kit components configured,” check the item&apos;s Item type under Inventory rules and check your role.</div>

  <h3>How to add VKit components</h3>
  <ol><li>Open <strong>Master data → Item master</strong>.</li><li>Open the parent Virtual kit SKU.</li><li>Scroll to <strong>Kit components</strong>.</li><li>Under <strong>Add or update component</strong>, select the component SKU.</li><li>Enter <strong>Quantity per kit</strong>: the component quantity required for one parent kit.</li><li>Enter the component&apos;s exact <strong>base UOM</strong>, such as <code>EA</code>. It must match the component Item Master record.</li><li>Select <strong>Optional component</strong> only when the kit can be fulfilled without that component.</li><li>Select <strong>Save component</strong>, then repeat for every component.</li><li>Review the component table and the warehouse-level <strong>Buildable now</strong> result.</li></ol>
  <table className="data-table"><tbody><tr><th>Parent VKit</th><td><code>VKIT-TV-001</code></td></tr><tr><th>Component</th><td><code>DEV-32SmartTV</code></td></tr><tr><th>Quantity per kit</th><td>1</td></tr><tr><th>Component base UOM</th><td>EA</td></tr><tr><th>Optional</th><td>No</td></tr></tbody></table>
  <p>Saving the same component again updates its quantity, UOM, and Optional setting instead of creating a duplicate component row.</p>
  <div className="knowledge-note"><strong>Current item-type limitation:</strong> Warevanta does not yet provide an Item Master control for changing the type of an existing item. If a planned VKit was created as Standard or Spare part, create a new parent item with type Virtual kit. Do not add components to the incorrectly typed record.</div>

  <h3>Understand virtual-kit allocation</h3>
  <p><strong>Buildable now</strong> shows the number of complete kits supported by the available-to-promise quantities of all required components in each warehouse. Optional components do not restrict this quantity.</p>
  <pre className="knowledge-tree">2 × KIT-A{`\n`}KIT-A = 1 × PART-X + 3 × PART-Y{`\n`}Allocation demand = 2 × PART-X + 6 × PART-Y</pre>
  <div className="knowledge-note"><strong>Virtual versus stocked:</strong> do not receive inventory into a virtual-kit SKU. Receive and count its components. Receive a Stocked kit only when it physically exists as a preassembled, separately labeled inventory unit.</div>

  <h3>Configure substitutes and reciprocal chains</h3>
  <table className="data-table"><thead><tr><th>Relationship</th><th>Meaning</th></tr></thead><tbody>{relationships.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td></tr>)}</tbody></table>
  <p><strong>Conversion ratio</strong> is the target quantity needed to replace one source base unit. Ratio 2 means 2 target units fulfill 1 source unit. Lower Priority numbers are tried first. Effective dates restrict use.</p>
  <p>Select <strong>Require approval before substitution</strong> when engineering, customer, warranty, regulatory, or commercial review is needed. Allocation cannot use it without order-specific approval.</p>
  <h3>Control principles</h3>
  <ul><li>Keep each physical spare part as a unique SKU.</li><li>Use reciprocal substitution only when interchangeability is valid in both directions.</li><li>Document compatibility and fitment in Notes.</li><li>Review ratios carefully; a wrong ratio creates wrong pick quantities.</li><li>Date-limit obsolete relationships rather than erasing business history.</li></ul>
  <div className="knowledge-checkpoint"><strong>Module 2 extension checkpoint</strong><p>Explain the difference between a virtual and stocked kit, how a parent VKit&apos;s component quantities are configured, and why a reciprocal substitute needs an inverse reverse ratio.</p></div>
</section>}
