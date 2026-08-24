import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const configuredConnectionString = process.env.DATABASE_ADMIN_URL;
if (!configuredConnectionString) throw new Error("DATABASE_ADMIN_URL is required");
const connectionUrl = new URL(configuredConnectionString);
connectionUrl.pathname = "/neondb";
const connectionString = connectionUrl.toString();
const bootstrap = await readFile(new URL("../database/bootstrap.sql", import.meta.url), "utf8");
const migrations = [
  ["001_initial", new URL("../database/schema.sql", import.meta.url)],
  ["002_inventory_controls", new URL("../database/migrations/002_inventory_controls.sql", import.meta.url)],
  ["003_receiving_putaway", new URL("../database/migrations/003_receiving_putaway.sql", import.meta.url)],
  ["004_outbound_orders", new URL("../database/migrations/004_outbound_orders.sql", import.meta.url)],
  ["005_inventory_counts", new URL("../database/migrations/005_inventory_counts.sql", import.meta.url)],
  ["006_erp_integrations", new URL("../database/migrations/006_erp_integrations.sql", import.meta.url)],
  ["007_access_security", new URL("../database/migrations/007_access_security.sql", import.meta.url)],
  ["008_platform_administration", new URL("../database/migrations/008_platform_administration.sql", import.meta.url)],
  ["009_subscription_billing", new URL("../database/migrations/009_subscription_billing.sql", import.meta.url)],
  ["010_paymongo_subscriptions", new URL("../database/migrations/010_paymongo_subscriptions.sql", import.meta.url)],
  ["011_access_freeze_ownership", new URL("../database/migrations/011_access_freeze_ownership.sql", import.meta.url)],
  ["012_secure_user_invitations", new URL("../database/migrations/012_secure_user_invitations.sql", import.meta.url)],
  ["013_password_recovery", new URL("../database/migrations/013_password_recovery.sql", import.meta.url)],
  ["014_email_verification", new URL("../database/migrations/014_email_verification.sql", import.meta.url)],
  ["015_two_factor_authentication", new URL("../database/migrations/015_two_factor_authentication.sql", import.meta.url)],
  ["016_receiving_controls", new URL("../database/migrations/016_receiving_controls.sql", import.meta.url)],
  ["017_purchasing", new URL("../database/migrations/017_purchasing.sql", import.meta.url)],
  ["018_putaway_replenishment", new URL("../database/migrations/018_putaway_replenishment.sql", import.meta.url)],
  ["019_outbound_fulfillment", new URL("../database/migrations/019_outbound_fulfillment.sql", import.meta.url)],
  ["020_returns_disposition", new URL("../database/migrations/020_returns_disposition.sql", import.meta.url)],
  ["021_inventory_traceability", new URL("../database/migrations/021_inventory_traceability.sql", import.meta.url)],
  ["022_serial_lifecycle_triggers", new URL("../database/migrations/022_serial_lifecycle_triggers.sql", import.meta.url)],
  ["023_reporting_automation", new URL("../database/migrations/023_reporting_automation.sql", import.meta.url)],
  ["024_report_delivery", new URL("../database/migrations/024_report_delivery.sql", import.meta.url)],
  ["025_fulfillment_exceptions", new URL("../database/migrations/025_fulfillment_exceptions.sql", import.meta.url)],
  ["026_cartons_manifests", new URL("../database/migrations/026_cartons_manifests.sql", import.meta.url)],
  ["027_dock_scheduling", new URL("../database/migrations/027_dock_scheduling.sql", import.meta.url)],
  ["028_cross_docking", new URL("../database/migrations/028_cross_docking.sql", import.meta.url)],
  ["029_replenishment_forecasting", new URL("../database/migrations/029_replenishment_forecasting.sql", import.meta.url)],
  ["030_labor_management", new URL("../database/migrations/030_labor_management.sql", import.meta.url)],
  ["031_approval_workflows", new URL("../database/migrations/031_approval_workflows.sql", import.meta.url)],
  ["032_reversal_approvals", new URL("../database/migrations/032_reversal_approvals.sql", import.meta.url)],
  ["033_approval_delegation_notifications", new URL("../database/migrations/033_approval_delegation_notifications.sql", import.meta.url)],
  ["034_approval_escalation_delivery", new URL("../database/migrations/034_approval_escalation_delivery.sql", import.meta.url)],
  ["035_cycle_count_automation", new URL("../database/migrations/035_cycle_count_automation.sql", import.meta.url)],
  ["036_inventory_valuation_reports", new URL("../database/migrations/036_inventory_valuation_reports.sql", import.meta.url)],
  ["037_inventory_availability_uom", new URL("../database/migrations/037_inventory_availability_uom.sql", import.meta.url)],
  ["038_uom_transaction_normalization", new URL("../database/migrations/038_uom_transaction_normalization.sql", import.meta.url)],
  ["039_subscription_user_pricing", new URL("../database/migrations/039_subscription_user_pricing.sql", import.meta.url)],
];
const client = new pg.Client({ connectionString, database: "neondb" });
console.log(`Connecting to hosted database ${client.connectionParameters.database}.`);
await client.connect();
try {
  const databaseIdentifier = `"${client.connectionParameters.database.replaceAll('"', '""')}"`;
  await client.query(bootstrap);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const [version,url] of migrations) {
    const sql=await readFile(url,"utf8");
    const executableSql=sql.replace(
      "GRANT CONNECT ON DATABASE stockflow TO stockflow_app;",
      `GRANT CONNECT ON DATABASE ${databaseIdentifier} TO stockflow_app;`,
    );
    const checksum=createHash("sha256").update(sql).digest("hex");
    const existing=await client.query("SELECT checksum FROM schema_migrations WHERE version=$1",[version]);
    if(existing.rows[0]){if(existing.rows[0].checksum!==checksum)throw new Error(`Migration ${version} was changed after being applied`);continue}
    await client.query("BEGIN");
    try{await client.query(executableSql);await client.query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)",[version,checksum]);await client.query("COMMIT");console.log(`Applied migration ${version}.`)}catch(error){await client.query("ROLLBACK");throw error}
  }
  console.log("Database is current.");
} finally { await client.end(); }
