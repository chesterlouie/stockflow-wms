import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { tenantRows } from "../../../lib/db";
export const metadata = { title: "Inventory counts" };
export const dynamic = "force-dynamic";
type Count = {
  id: string;
  count_no: string;
  count_type: string;
  status: string;
  warehouse: string;
  location: string | null;
  lines: string;
  counted: string;
};
type Warehouse = { id: string; name: string };
type Location = { id: string; code: string };
type Schedule={id:string;name:string;warehouse:string;location:string|null;abc_classes:string[];frequency_days:string;variance_threshold:string;next_run_at:string;active:boolean};
export default async function Counts({
  searchParams,
}: {
  searchParams: Promise<{ error?: string;classified?:string;scheduled?:string }>;
}) {
  const s = await getSession();
  const { error } = await searchParams;
  const counts = s
    ? await tenantRows<Count>(
        s.companyId,
        `SELECT c.id,c.count_no,c.count_type,c.status,w.name AS warehouse,l.code AS location,count(cl.id)::text AS lines,count(cl.id) FILTER(WHERE cl.status<>'pending')::text AS counted FROM inventory_counts c JOIN warehouses w ON w.id=c.warehouse_id LEFT JOIN locations l ON l.id=c.location_id LEFT JOIN inventory_count_lines cl ON cl.count_id=c.id WHERE c.company_id=$1 GROUP BY c.id,w.name,l.code ORDER BY c.created_at DESC`,
        [s.companyId],
      )
    : [];
  const warehouses = s
    ? await tenantRows<Warehouse>(
        s.companyId,
        `SELECT id,name FROM warehouses WHERE company_id=$1 AND active=true ORDER BY name`,
        [s.companyId],
      )
    : [];
  const locations = s
    ? await tenantRows<Location>(
        s.companyId,
        `SELECT id,code FROM locations WHERE company_id=$1 AND active=true AND type IN('storage','picking','packing','shipping') ORDER BY code`,
        [s.companyId],
      )
    : [];
  const schedules=s?await tenantRows<Schedule>(s.companyId,`SELECT s.id,s.name,w.name warehouse,l.code location,s.abc_classes,s.frequency_days::text,s.variance_threshold::text,s.next_run_at::text,s.active FROM cycle_count_schedules s JOIN warehouses w ON w.id=s.warehouse_id LEFT JOIN locations l ON l.id=s.location_id WHERE s.company_id=$1 ORDER BY s.active DESC,s.next_run_at`,[s.companyId]):[];
  const q=await searchParams;
  return (
    <div className="app-content">
      <div className="page-heading">
        <div>
          <h1>Inventory counts</h1>
          <p>Cycle, physical, and wall-to-wall stock verification.</p>
        </div>
      </div>
      {error && (
        <div className="form-error">
          {error === "empty"
            ? "There is no stock in the selected scope."
            : "The count plan could not be created."}
        </div>
      )}
      {(q.classified||q.scheduled)&&<div className="success-banner">{q.classified?'ABC classification recalculated from the last 90 days of movement.':'Cycle-count schedule created.'}</div>}
      <div className="form-layout">
        <section className="panel">
          <h2>Count plans</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Count</th>
                <th>Type</th>
                <th>Scope</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {counts.length ? (
                counts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="table-link" href={`/app/counts/${c.id}`}>
                        {c.count_no}
                      </Link>
                    </td>
                    <td>{c.count_type.replaceAll("_", " ")}</td>
                    <td>{c.location || c.warehouse}</td>
                    <td>
                      {c.counted}/{c.lines}
                    </td>
                    <td>
                      <span className="badge">{c.status}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-cell" colSpan={5}>
                    No count plans yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <aside className="panel">
          <h2>Start a count</h2>
          <form
            className="form-stack compact-form"
            method="post"
            action="/api/counts"
          >
            <div className="field">
              <label>Count number</label>
              <input name="countNo" placeholder="CC-0001" required />
            </div>
            <div className="field">
              <label>Count type</label>
              <select name="countType" defaultValue="cycle">
                <option value="cycle">Cycle count</option>
                <option value="physical">Physical count</option>
                <option value="wall_to_wall">Wall-to-wall count</option>
              </select>
            </div>
            <div className="field">
              <label>Warehouse</label>
              <select name="warehouseId">
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Location (optional for wall-to-wall)</label>
              <select name="locationId">
                <option value="">Entire warehouse</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
              </select>
            </div>
            <label className="radio-card">
              <input type="checkbox" name="blindCount" defaultChecked />
              <span>
                <strong>Blind count</strong>
                <small>Hide expected quantities until entered.</small>
              </span>
            </label>
            <button className="button button-primary">Create count plan</button>
          </form>
        </aside>
      </div>
      <div className="form-layout" style={{marginTop:15}}><section className="panel"><div className="panel-heading"><div><h2>Automated cycle-count schedules</h2><p>Generate blind counts by ABC class and frequency.</p></div><form method="post" action="/api/counts/classify"><button className="button button-secondary">Recalculate ABC classes</button></form></div>{schedules.length?schedules.map(x=><article className="pick-card" key={x.id}><div><span className="badge">{x.active?'active':'disabled'}</span><strong>{x.name} · Classes {x.abc_classes.join(', ')}</strong><small>{x.location||x.warehouse} · Every {x.frequency_days} day(s) · Recount variance above {x.variance_threshold}</small><small>Next run {new Date(x.next_run_at).toLocaleString()}</small></div><form method="post" action={`/api/counts/schedules/${x.id}/generate`}><button className="button button-secondary">Generate now</button></form></article>):<p className="empty-cell">No automated schedules configured.</p>}</section><aside className="panel"><h2>Create count schedule</h2><form className="form-stack" method="post" action="/api/counts/schedules"><input name="name" placeholder="Weekly A-class count" required/><select name="warehouseId">{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><select name="locationId"><option value="">Entire warehouse</option>{locations.map(l=><option key={l.id} value={l.id}>{l.code}</option>)}</select><div className="radio-group"><label className="radio-card"><input type="checkbox" name="abcClasses" value="A" defaultChecked/>A items</label><label className="radio-card"><input type="checkbox" name="abcClasses" value="B"/>B items</label><label className="radio-card"><input type="checkbox" name="abcClasses" value="C"/>C items</label></div><div className="field"><label>Frequency in days</label><input name="frequencyDays" type="number" min="1" max="365" defaultValue="7" required/></div><div className="field"><label>Recount variance threshold</label><input name="varianceThreshold" type="number" min="0.000001" step="any" defaultValue="1" required/></div><div className="field"><label>First run</label><input name="nextRunAt" type="datetime-local" required/></div><label className="radio-card"><input type="checkbox" name="blindCount" defaultChecked/>Blind count</label><button className="button button-primary">Create schedule</button></form></aside></div>
    </div>
  );
}
