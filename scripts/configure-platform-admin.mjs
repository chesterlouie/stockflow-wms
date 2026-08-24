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
  const result = await client.query(
    `INSERT INTO platform_admins(user_id)
     SELECT id FROM users WHERE lower(email)=lower($1)
     ON CONFLICT(user_id) DO NOTHING`,
    [platformAdminEmail],
  );
  console.log(result.rowCount ? "Hosted platform administrator configured." : "Hosted platform administrator already configured or account not registered yet.");
} finally {
  await client.end();
}
