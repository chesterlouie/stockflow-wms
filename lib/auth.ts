import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE_NAME = "stockflow_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;
export type Session = { userId: string; companyId: string; email: string; role: string; mustChangePassword?: boolean };

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSession(session: Session) {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  await db().query(`INSERT INTO auth_sessions(token_hash,user_id,company_id,expires_at) VALUES($1,$2,$3,now()+$4::interval)`, [tokenHash,session.userId,session.companyId,`${MAX_AGE_SECONDS} seconds`]);
  return token;
}

export async function getSession(): Promise<Session|null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const result = await db().query<Session>(`SELECT s.user_id AS "userId",s.company_id AS "companyId",u.email,m.role,u.must_change_password AS "mustChangePassword" FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN company_members m ON m.company_id=s.company_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[tokenHash]);
  return result.rows[0] ?? null;
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db().query("DELETE FROM auth_sessions WHERE token_hash=$1",[await hashToken(token)]);
}

export function sessionCookie(token: string) { return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
export function clearSessionCookie() { return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
