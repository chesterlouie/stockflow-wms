# Warevanta local production runbook

## Before startup

1. Install Docker Desktop on the warehouse server and assign it a fixed LAN address.
2. Copy `.env.production.example` to `.env.production` and replace every placeholder with independently generated URL-safe secrets.
3. Point `stockflow.local` on warehouse devices or local DNS to the server address.
4. Keep `.env.production` off shared folders and ordinary user backups.

## Start and upgrade

Start with `docker compose --env-file .env.production -f compose.production.yml up -d --build`. Warevanta validates its configuration, configures the restricted database role, and applies checksum-protected migrations before serving traffic.

After an upgrade, check `https://stockflow.local/api/ready`. A healthy response says `ready`, `connected`, and shows the latest migration.

## Trust HTTPS on warehouse phones

Caddy creates a private local certificate authority. Export its root certificate from the `caddy_data` volume and install it as trusted on managed warehouse phones. Camera scanning requires trusted HTTPS. For unmanaged or internet-accessible devices, use a real DNS name and publicly trusted certificate instead of `tls internal`.

## Backups

The backup service writes a compressed PostgreSQL backup and SHA-256 checksum to `backups/` daily, validates the archive, and retains 14 days by default. Copy backups to a second encrypted device or storage location. A backup on the same server does not protect against disk loss, theft, or ransomware.

Review backup timestamps daily. Test a restore into a separate non-production database at least monthly.

## Restore

1. Stop the application and backup services while leaving PostgreSQL running.
2. Set `DATABASE_ADMIN_URL` for the intended target database.
3. Run `ops/restore-backup.ps1 -BackupFile <absolute .dump path> -ConfirmRestore RESTORE_STOCKFLOW`.
4. Apply current migrations, restart services, and confirm `/api/ready`.

The restore command replaces objects in the target database. Verify the target and preserve the original volume until validation is complete.

## Monitoring and incidents

Schedule `ops/health-check.ps1` every five minutes with Windows Task Scheduler and alert when it exits with an error. Monitor free disk space, container restarts, backup age, and PostgreSQL volume health.

For an incident, preserve logs and a database snapshot, revoke affected credentials, rotate secrets, and record the recovery in the security audit process.
