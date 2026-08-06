import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdmin } from "../../lib/platform-admin";

export const dynamic="force-dynamic";
export default async function AdminLayout({children}:{children:React.ReactNode}){
  const admin=await getPlatformAdmin();
  if(!admin)redirect('/signin?returnTo=/admin');
  return <div className="admin-shell"><aside className="admin-sidebar"><Link href="/admin" className="brand"><span className="brand-mark">S</span><span>StockFlow Control</span></Link><div className="admin-label">PLATFORM ADMINISTRATION</div><nav><Link href="/admin">Companies</Link><Link href="/admin#audit">Audit logs</Link><Link href="/">Public landing page</Link><Link href="/app/dashboard">Warehouse workspace</Link></nav><div className="admin-identity"><small>Signed in as</small><strong>{admin.displayName}</strong><span>{admin.email}</span><form action="/api/auth/signout" method="post"><button type="submit">Sign out</button></form></div></aside><main className="admin-main">{children}</main></div>
}
