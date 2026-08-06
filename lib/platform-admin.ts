import { getSession } from "./auth";
import { db } from "./db";

export async function getPlatformAdmin() {
  const session=await getSession();
  if(!session)return null;
  const admin=(await db().query<{display_name:string}>(`SELECT u.display_name FROM platform_admins p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1`,[session.userId])).rows[0];
  return admin?{...session,displayName:admin.display_name}:null;
}
