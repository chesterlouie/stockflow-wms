import {NextResponse, type NextRequest} from 'next/server';
import {db} from './lib/db';
import {hashToken} from './lib/tokens';

const operatorPages=[
  '/app/dashboard',
  '/app/help',
  '/app/docks/mobile',
  '/app/receiving',
  '/app/putaway/mobile',
  '/app/inventory',
  '/app/inventory/transfer',
  '/app/fulfillment/mobile',
  '/app/packing/cartons',
  '/app/dispatch/mobile',
  '/app/restricted',
];

const operatorPagePrefixes=['/app/receiving/','/app/cartons/'];

const managerPages=[
  '/app/dashboard','/app/help','/app/approvals','/app/exceptions','/app/items','/app/categories','/app/suppliers','/app/setup',
  '/app/purchasing','/app/docks','/app/receiving','/app/putaway/mobile','/app/cross-dock','/app/inventory',
  '/app/counts','/app/replenishment','/app/forecasting','/app/traceability','/app/returns','/app/orders',
  '/app/waves','/app/fulfillment/mobile','/app/packing/cartons','/app/cartons','/app/dispatch/mobile',
  '/app/manifests','/app/labor','/app/reports','/app/report-automation','/app/delivery-history','/app/restricted',
];

const viewerPages=[
  '/app/dashboard','/app/help','/app/inventory','/app/traceability','/app/reports','/app/restricted',
];

const operatorMutationPrefixes=[
  '/api/account/',
  '/api/auth/signout',
  '/api/receiving',
  '/api/inventory/transfer',
  '/api/putaway/',
  '/api/picks/',
  '/api/packing/',
  '/api/cartons',
];

function isOperatorPage(pathname:string){
  return operatorPages.includes(pathname)||operatorPagePrefixes.some(path=>pathname.startsWith(path));
}

function isManagerPage(pathname:string){
  return managerPages.some(path=>pathname===path||pathname.startsWith(`${path}/`));
}

function isViewerPage(pathname:string){
  return viewerPages.includes(pathname);
}

function isOperatorMutation(pathname:string){
  if(operatorMutationPrefixes.some(path=>pathname===path||pathname.startsWith(path)))return true;
  return /^\/api\/orders\/[^/]+\/dispatch$/.test(pathname)||/^\/api\/appointments\/[^/]+\/status$/.test(pathname);
}

async function currentRole(request:NextRequest){
  const token=request.cookies.get('stockflow_session')?.value;
  if(!token)return null;
  const result=await db().query<{role:string}>(`SELECT m.role FROM auth_sessions s JOIN company_members m ON m.company_id=s.company_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[await hashToken(token)]);
  return result.rows[0]?.role??null;
}

export async function proxy(request:NextRequest){
  const role=await currentRole(request);
  const {pathname}=request.nextUrl;
  const allowedPage=role==='operator'?isOperatorPage(pathname):role==='manager'?isManagerPage(pathname):role==='viewer'?isViewerPage(pathname):true;
  if(pathname.startsWith('/app/')&&!allowedPage){
    return NextResponse.redirect(new URL('/app/restricted',request.url));
  }
  const mutation=!['GET','HEAD','OPTIONS'].includes(request.method);
  const publicAccountMutation=pathname.startsWith('/api/auth/')||/^\/api\/invitations\/[^/]+\/accept$/.test(pathname);
  const viewerPersonalMutation=pathname.startsWith('/api/account/')||pathname==='/api/auth/signout'||pathname==='/api/approvals/notifications/read';
  const managerRestrictedMutation=['/api/billing','/api/integrations','/api/users','/api/invitations','/api/warehouses','/api/admin'].some(path=>pathname===path||pathname.startsWith(`${path}/`));
  const deniedMutation=!publicAccountMutation&&(role==='viewer'&&!viewerPersonalMutation||role==='operator'&&!isOperatorMutation(pathname)||role==='manager'&&managerRestrictedMutation);
  if(pathname.startsWith('/api/')&&mutation&&deniedMutation){
    return NextResponse.json({error:'This action requires a manager or administrator.'},{status:403});
  }
  return NextResponse.next();
}

export const config={matcher:['/app/:path*','/api/:path*']};
