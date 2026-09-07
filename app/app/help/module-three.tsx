const roles=[
  ['Owner','Primary company authority. Has company-wide access and controls users, billing, integrations, security, warehouses, and stores.'],
  ['Administrator','Manages users, invitations, access assignments, and company-level configuration.'],
  ['Manager','Supervises assigned warehouse operations, inventory controls, approvals, and reports.'],
  ['Operator','Performs daily receiving, scanning, transfers, picking, packing, and dispatch for assigned warehouse work.'],
  ['Viewer','Read-only company user, or a requesting-store user when assigned exclusively to one active store.'],
];

export default function ModuleThree(){return <section className="panel" id="module-3">
  <div className="panel-heading"><div><p className="eyebrow">Module 3</p><h2>Users, Roles, and Access Profiles</h2><p>Goal: give every person an individual account, an appropriate role, and access only to the warehouse or requesting store needed for their job.</p></div><span className="badge">Updated</span></div>
  <h3>Why individual accounts matter</h3>
  <p>Never let employees share one username. Individual accounts record who received, adjusted, approved, picked, dispatched, or changed a record. Access can then be changed for one person without affecting everyone else.</p>
  <h3>Understand the roles</h3>
  <table className="data-table"><thead><tr><th>Role</th><th>Recommended responsibility</th></tr></thead><tbody>{roles.map(x=><tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td></tr>)}</tbody></table>
  <div className="knowledge-note"><strong>Least privilege:</strong> assign the lowest role that permits the work. Do not make every user an administrator. A role determines what kind of work is allowed; an access profile identifies where that user works.</div>
  <h3>Invite a user</h3>
  <p>Open <strong>Administration → Users &amp; access</strong>. Enter the person’s full name and unique work email, choose a role, and send the invitation. The invitee opens the secure link, creates a password, and joins this company workspace.</p>
  <p>Invitations expire after <strong>72 hours</strong>. Active pending invitations reserve places against the company user limit. If email delivery is unavailable, Warevanta shows the link for secure copying.</p>
  <h3>Assign a warehouse or requesting store</h3>
  <ol><li>Open <strong>Administration → Users &amp; access</strong>.</li><li>Select <strong>Manage access scopes</strong>.</li><li>Find the user whose profile you want to change.</li><li>For an internal user, select one or more active warehouses.</li><li>For requesting-store personnel, use the company <strong>Viewer</strong> role, select one active store, and assign <strong>Store Viewer</strong>, <strong>Store Operator</strong>, or <strong>Store Manager</strong>.</li><li>Select <strong>Save access profile</strong>.</li></ol>
  <div className="knowledge-note"><strong>Store-role separation:</strong> Store Viewer can check availability and history. Store Operator can request and receive stock and submit returns, transfers, and miscellaneous issues. Store Manager can do the same and approve transactions for the assigned store. These roles do not grant warehouse access.</div>
  <p>Only the Company Owner or Administrator can save access profiles. Owners retain access to every company warehouse and are not reduced to a single assignment.</p>
  <table className="data-table"><thead><tr><th>Profile</th><th>Use</th><th>Login result</th></tr></thead><tbody><tr><td><strong>Warehouse profile</strong></td><td>Manager, Operator, Administrator, or Viewer working inside company warehouse operations.</td><td>The dashboard shows the approved warehouse names and role in the Access profile banner.</td></tr><tr><td><strong>Requesting-store profile</strong></td><td>Viewer assigned exclusively to one active store.</td><td>Warevanta sends the user directly to that store’s restricted Store Request Portal.</td></tr><tr><td><strong>Owner profile</strong></td><td>Primary company authority.</td><td>The dashboard shows All company warehouses.</td></tr></tbody></table>
  <div className="knowledge-note"><strong>Exclusive store rule:</strong> a requesting-store assignment cannot be combined with warehouse assignments. This prevents a store user from receiving a restricted portal and internal warehouse responsibilities at the same time.</div>
  <h3>What happens after an access change?</h3>
  <p>Saving an access profile revokes that user’s active Warevanta sessions. The user must sign in again. This ensures the new role, warehouse list, or store assignment takes effect without relying on an old browser session.</p>
  <ul><li>A store Viewer is redirected to <strong>Store Request Portal</strong>.</li><li>An internal user sees the <strong>Access profile</strong> banner on the warehouse dashboard.</li><li>If no warehouse is assigned, the dashboard tells the user to ask an Owner or Administrator to update the profile.</li><li>Deactivating a requesting store makes it unavailable to its assigned store user.</li></ul>
  <h3>Invitation controls</h3>
  <ul><li><strong>Resend:</strong> replaces the old link with a new invitation and expiry.</li><li><strong>Revoke:</strong> invalidates an invitation that should no longer be accepted.</li><li><strong>Expired:</strong> the link is unusable and must be resent.</li></ul>
  <h3>Change a role</h3>
  <p>An Owner or Administrator can change a non-owner user’s role. Saving the change revokes that user’s sessions so the updated authority takes effect at the next sign-in. Review the access profile after every role change—especially when changing a user to or from Viewer.</p>
  <h3>Reset a password</h3>
  <p>An Owner or Administrator can generate a temporary password for a non-owner user. Existing sessions are revoked and the user must change it at the next sign-in. Share temporary passwords only through a private channel.</p>
  <h3>Recommended assignments</h3>
  <table className="data-table"><thead><tr><th>Person</th><th>Role</th><th>Typical scope</th></tr></thead><tbody><tr><td>Business owner</td><td>Owner</td><td>All company warehouses</td></tr><tr><td>System administrator</td><td>Administrator</td><td>Warehouses being administered</td></tr><tr><td>Warehouse supervisor</td><td>Manager</td><td>One or more supervised warehouses</td></tr><tr><td>Receiver or picker</td><td>Operator</td><td>Work warehouse</td></tr><tr><td>Auditor or executive</td><td>Viewer</td><td>Approved warehouse visibility</td></tr><tr><td>Requesting-store employee</td><td>Viewer</td><td>One requesting store only</td></tr></tbody></table>
  <h3>Warehouse and store scope enforcement</h3>
  <div className="knowledge-note"><strong>Access rule:</strong> warehouse assignments are enforced across operational screens, direct transaction routes, dashboards, and operational report exports. Requesting-store users are isolated to their assigned Store Inventory Portal. Owners retain all-company warehouse access; integration API credentials remain company-scoped until credential-level warehouse scopes are configured.</div>
  <h3>Common mistakes</h3>
  <ul><li>Sharing the Owner account.</li><li>Assigning Administrator when Operator or Manager is sufficient.</li><li>Giving a requesting-store user an operational role instead of Viewer.</li><li>Trying to combine a store assignment with warehouse assignments.</li><li>Changing a role without reviewing the access profile.</li><li>Sending an invitation to the wrong person.</li><li>Leaving unused invitations active and consuming capacity.</li><li>Sharing temporary passwords in group chats.</li><li>Ignoring unexpected sessions or audit events.</li></ul>
  <h3>Practice checklist</h3>
  <ul className="knowledge-checklist"><li>Identify your Owner account</li><li>Review users and active sessions</li><li>Invite an email you control as Operator if a slot is available</li><li>Assign that Operator to the training warehouse</li><li>Sign in as the Operator and verify the dashboard Access profile</li><li>Create or use a Viewer account for requesting-store QA</li><li>Assign the Viewer to one active requesting store</li><li>Sign in as the Viewer and verify direct Store Portal access</li><li>Confirm the old session was revoked after changing the profile</li><li>Find the access change in audit history</li></ul>
  <div className="knowledge-checkpoint"><strong>Module 3 checkpoint</strong><p>Explain the difference between a role and an access profile, why a store user must be a Viewer, and why Warevanta signs a user out after an access change.</p></div>
</section>}
