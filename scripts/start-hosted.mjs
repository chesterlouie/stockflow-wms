import { spawn } from "node:child_process";

const adminConnection = process.env.DATABASE_ADMIN_URL;
const appPassword = process.env.APP_DB_PASSWORD;

if (!adminConnection || !appPassword) {
  throw new Error("DATABASE_ADMIN_URL and APP_DB_PASSWORD are required");
}

const adminConnectionUrl = new URL(adminConnection);
const hostedDatabaseName = "neondb";
if (hostedDatabaseName) {
  adminConnectionUrl.pathname = `/${hostedDatabaseName}`;
}
process.env.DATABASE_ADMIN_URL = adminConnectionUrl.toString();

const applicationConnection = new URL(process.env.DATABASE_ADMIN_URL);
applicationConnection.username = "stockflow_app";
applicationConnection.password = appPassword;
process.env.DATABASE_URL = applicationConnection.toString();

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand, args, { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm ${args.join(" ")} exited with ${signal || code}`));
    });
  });
}

await run(["run", "config:validate"]);
await run(["run", "db:migrate"]);
await run(["run", "db:configure-platform-admin"]);
await run(["run", "db:configure-role"]);
await run(["run", "start", "--", "--hostname", "0.0.0.0", "--port", process.env.PORT || "3000"]);
