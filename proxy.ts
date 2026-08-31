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
  if(role!=='operator')return NextResponse.next();
  const {pathname}=request.nextUrl;
  if(pathname.startsWith('/app/')&&!isOperatorPage(pathname)){
    return NextResponse.redirect(new URL('/app/restricted',request.url));
  }
  if(pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method)&&!isOperatorMutation(pathname)){
    return NextResponse.json({error:'This action requires a manager or administrator.'},{status:403});
  }
  return NextResponse.next();
}

export const config={matcher:['/app/:path*','/api/:path*']};
