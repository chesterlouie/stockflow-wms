# Warevanta staging runbook

## Provision once

1. Create a staging-only managed PostgreSQL database with automated provider backups and TLS required.
2. Create separate administrator and application credentials. Never reuse production credentials.
3. Point a staging DNS name to the staging server and allow inbound ports 80 and 443 only.
4. Copy `.env.staging.example` to `.env.staging` on the server, restrict file access, and replace every placeholder.
5. Keep `REPORT_DELIVERY_ENABLED=false` until recipients and the Resend sender have been reviewed.

## Validate configuration

Load `.env.staging`, then run `pnpm run config:validate:staging`. Validation requires HTTPS, a matching domain, an immutable container-image digest, TLS-protected non-local database URLs, and strong secrets.

## Release

The GitHub staging-readiness workflow runs builds and security checks and publishes a commit-tagged image to GHCR after changes reach `main`. Resolve that tag to its `sha256` digest before deployment.

Run `ops/deploy-staging.ps1 -Image <registry/image@sha256:digest> -Domain <staging-domain>`. The script pulls the immutable image, starts the application, worker, and gateway, verifies `/api/ready`, and restores the previously recorded image when health verification fails.

## Roll back

Run `ops/rollback-staging.ps1 -Domain <staging-domain> -ConfirmRollback ROLLBACK_WAREVANTA_STAGING`. Rollback uses the previously recorded immutable digest and must pass the same health check.

Database migrations are forward-only. For a database-level rollback, restore a verified pre-release backup into a separate recovery database first, validate it, and then coordinate a maintenance window.

## Backup and restore

Use the managed provider's point-in-time recovery as the primary recovery mechanism. Also run `ops/backup-managed.ps1` to encrypted off-provider storage before releases and at least daily. It creates a custom-format dump, verifies the archive, and writes a SHA-256 manifest.

Restore only with `ops/restore-managed.ps1`. It requires the matching checksum, the exact expected database hostname, and `RESTORE_WAREVANTA_STAGING` confirmation. Never test restores against the active staging database; restore into an isolated recovery database.

## Monitoring

Run `ops/monitor-staging.ps1` every five minutes from an external monitor. Check `/api/ready`, HTTPS reachability, and backup age. Alert on failures, container restarts, database connection saturation, disk pressure, certificate expiry, and backups older than 30 hours.

## Promotion rule

Promote a release only after `pnpm run staging:full` passes, a backup exists, the staging health check remains green, mobile scanning is tested on a physical phone, and the main receiving-to-dispatch workflow has been accepted by an operations user.
