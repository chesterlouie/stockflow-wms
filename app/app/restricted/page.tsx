import Link from 'next/link';

export const metadata={title:'Restricted access'};

export default function RestrictedAccess(){
  return <div className="app-content"><section className="panel"><span className="eyebrow">Operator access</span><h1>This area requires a manager or administrator</h1><p>Your Operator account is limited to receiving, scanning, putaway, stock transfers, picking, packing, and dispatch. Ask your company administrator if your responsibilities have changed.</p><div className="page-actions"><Link className="button button-primary" href="/app/dashboard">Return to dashboard</Link><Link className="button button-secondary" href="/app/help">Open knowledge base</Link></div></section></div>;
}
