import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";
import { db } from "../../lib/db";

export const dynamic = "force-dynamic";
const links=[['/app/dashboard','⌂','Dashboard'],['/app/items','□','Item master'],['/app/purchasing','▤','Purchasing'],['/app/purchasing/import','↥','PO import'],['/app/receiving','⇩','Receiving'],['/app/receiving/mobile','▣','Mobile receiving'],['/app/putaway/mobile','↳','Mobile putaway'],['/app/replenishment','↻','Replenishment'],['/app/orders','⇧','Orders & picking'],['/app/waves','≋','Pick waves'],['/app/inventory','⇄','Inventory'],['/app/counts','✓','Counts'],['/app/reports','▥','Reports'],['/app/integrations','⌁','ERP integrations'],['/app/users','♙','Users & access'],['/app/setup','⌘','Warehouse setup'],['/app/company','⚙','Company & plan'],['/app/billing','₱','Subscription & billing'],['/account/security','⚿','Account security']];

export default async function AppLayout({children}:{children:React.ReactNode}){
  const session=await getSession(); if(!session) redirect('/signin'); if(session.mustChangePassword) redirect('/account/password');
  const company=(await db().query<{name:string;access_status:string;subscription_ends_at:string|null}>("SELECT name,access_status,subscription_ends_at::text FROM companies WHERE id=$1",[session.companyId])).rows[0];
  if(!company||company.access_status==='frozen'||(company.subscription_ends_at&&Date.parse(company.subscription_ends_at)<Date.now()))redirect('/access-suspended');
  const initials=session.email.slice(0,2).toUpperCase();
  return <div className="app-shell"><aside className="sidebar"><Link href="/app/dashboard" className="brand"><span className="brand-mark">W</span><span>Warevanta</span></Link><div className="company-chip"><small>COMPANY SPACE</small><strong>{company?.name||'Company'}</strong></div><nav className="app-nav">{links.map(([href,icon,label])=><Link key={label} href={href} aria-label={label}>{icon} <span>{label}</span></Link>)}</nav><div className="sidebar-foot"><form method="post" action="/api/auth/signout"><button className="signout-button" type="submit">Sign out</button></form><br/>Tenant-isolated workspace</div></aside><main className="app-main"><header className="app-topbar"><div className="warehouse-title"><strong>Main Warehouse</strong><small>{company?.name}</small></div><div className="user-avatar" aria-label={session.email}>{initials}</div></header>{children}</main></div>}
