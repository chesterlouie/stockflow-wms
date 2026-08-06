import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const identity = await client.query("SELECT current_user, current_setting('row_security') AS row_security");
  const tables = await client.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('companies','users','auth_sessions','warehouses','items','item_barcodes','inventory_ledger')`);
  if (identity.rows[0].current_user !== "stockflow_app") throw new Error("Application is not using the restricted stockflow_app role");
  if (identity.rows[0].row_security !== "on") throw new Error("PostgreSQL row security is not enabled for the application connection");
  if (tables.rows[0].count !== 7) throw new Error("One or more required database tables are missing");
  console.log("Database role, row security, and core tables verified.");
} finally { await client.end(); }
