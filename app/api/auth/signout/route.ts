import { clearSessionCookie, revokeCurrentSession } from "../../../../lib/auth";
export async function POST(request:Request){await revokeCurrentSession();return new Response(null,{status:303,headers:{Location:new URL('/',request.url).toString(),'Set-Cookie':clearSessionCookie()}})}
