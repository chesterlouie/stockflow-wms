import pg from "pg";

const configuredConnectionString = process.env.DATABASE_ADMIN_URL;
const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();

if (!configuredConnectionString) throw new Error("DATABASE_ADMIN_URL is required");
if (!platformAdminEmail) {
  console.log("No hosted platform administrator email configured.");
  process.exit(0);
}

const connectionUrl = new URL(configuredConnectionString);
connectionUrl.pathname = "/neondb";
const client = new pg.Client({ connectionString: connectionUrl.toString(), database: "neondb" });

await client.connect();
try {
  await client.query("BEGIN");
  const account = (await client.query(
    "SELECT id FROM users WHERE lower(email)=lower($1)",
    [platformAdminEmail],
  )).rows[0];
  if (!account) {
    await client.query("ROLLBACK");
    console.log("Hosted platform administrator account is not registered yet.");
  } else {
    await client.query("DELETE FROM platform_admins WHERE user_id<>$1", [account.id]);
    await client.query("INSERT INTO platform_admins(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [account.id]);
    await client.query("COMMIT");
    console.log("Exclusive hosted platform administrator configured.");
  }
} finally {
  await client.end();
}
