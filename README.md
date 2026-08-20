# Warevanta WMS

## Local service command

From the Warevanta project folder on Windows:

```powershell
.\stockflow.cmd start
```

Other available commands:

```powershell
.\stockflow.cmd status
.\stockflow.cmd restart
.\stockflow.cmd stop
```

Before promoting a release, run `pnpm run staging:full`. Managed staging deployment, backup, monitoring, and rollback procedures are documented in `ops/STAGING-RUNBOOK.md`.

After startup, open `https://localhost`.

For a phone connected to the same Wi-Fi, set `STOCKFLOW_LAN_HOST` in the ignored
production environment file to the computer's LAN IP, install the Caddy local
root certificate on the device, and open the corresponding HTTPS address. Allow
inbound TCP 443 only on private network profiles.

Local-first, cloud-ready warehouse management for small and medium businesses.

## Current first slice

- Public product landing page
- Company workspace registration, sign-in, sign-out, and revocable sessions
- Multi-company dashboard shell
- Item master list and create-item workflow
- Automatic or manual barcode selection
- Multiple pack, case, and pallet barcodes per item
- Warehouse location setup
- Manual receiving into an immutable inventory ledger
- Stock-on-hand balances and movement history
- Atomic location transfers with paired ledger entries
- Controlled stock adjustments with reason codes
- Negative-stock prevention for transfers and reductions
- Lot-and-expiry preservation across inventory movements
- Expected inbound receipts and supplier references
- Accepted, held, and damaged inspection outcomes
- Automatic guided putaway tasks and confirmation
- Customer sales orders with priority and requested ship dates
- FEFO/FIFO stock allocation with reservation protection
- Mobile-friendly pick tasks with location and item barcode validation
- Dedicated mobile pick-and-pack queues with priority, wave, and scan filtering
- Mobile dispatch verification with carrier, tracking, and printable shipment labels
- Short-pick exceptions, manager reallocation, and controlled order holds or cancellation
- Carton-level packing, weights and dimensions, carton labels, and carrier manifests
- Conflict-safe dock scheduling, supplier appointments, and mobile gate check-in
- Demand-driven cross-docking with partial putaway preservation and scan validation
- Demand forecasting, stockout projections, and approved replenishment recommendations
- Auditable storage-to-packing movements and dispatch inventory issue
- Cycle, physical, and wall-to-wall inventory count plans
- Blind mobile count entry with location and barcode validation
- Manager variance approval with stale-count protection and ledger adjustments
- Live operational dashboard based on tenant warehouse activity
- Standard stock, movement, receiving, fulfillment, expiry, and variance reports
- CSV export for every standard report
- One-time, hashed ERP API credentials with read-only or write access
- Versioned Item Master and inventory availability APIs
- Idempotent ERP inventory adjustment endpoint with negative-stock protection
- Per-company API request history and credential revocation
- Company user creation with one-time temporary credentials
- Owner, administrator, manager, operator, and viewer roles
- Forced first-sign-in password change and administrator password reset
- Session revocation after credential or role changes
- Sign-in throttling after repeated failed attempts
- Tenant-isolated security audit history
- Installable mobile web app manifest and offline fallback
- Rear-camera barcode scanning for supported smartphone browsers
- Manual and Bluetooth scanner fallback
- Device-local offline scan drafts with online inventory validation
- Scan vibration, audio feedback, connectivity, and install indicators
- Production container stack with HTTPS reverse proxy and security headers
- Automated verified daily PostgreSQL backups with retention
- Destructive-action-guarded restore tooling and recovery runbook
- Database readiness monitoring and production environment validation
- PostgreSQL tenant-aware schema with forced row-level security
- Repeatable, checksum-protected database migration and verification scripts
- Docker Compose database setup
- Health API endpoint

## Local development

1. Copy `.env.example` to `.env.local`.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Apply the schema with `npm run db:migrate`, then check it with `npm run db:verify`.
4. Install dependencies and run the web application with `npm run dev`.
5. Open `http://localhost:3000`.

Passwords use a costed bcrypt hash. Sessions are random, HTTP-only, revocable database records. Every inventory query runs inside a tenant-scoped database transaction, backed by PostgreSQL row-level security.

Email verification, password reset, multi-factor authentication, and sign-in throttling remain before public production launch.
