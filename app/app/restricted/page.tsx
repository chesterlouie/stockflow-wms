import Link from 'next/link';
import {getSession} from '../../../lib/auth';

export const metadata={title:'Restricted access'};

export default async function RestrictedAccess(){
  const session=await getSession();const role=session?.role||'user';
  return <div className="app-content"><section className="panel"><span className="eyebrow">{role} access</span><h1>This area is not available for your role</h1><p>Your Warevanta role only provides the applications and actions required for your assigned responsibilities. Ask your company owner or administrator if those responsibilities have changed.</p><div className="page-actions"><Link className="button button-primary" href="/app/dashboard">Return to dashboard</Link><Link className="button button-secondary" href="/app/help">Open knowledge base</Link></div></section></div>;
}
