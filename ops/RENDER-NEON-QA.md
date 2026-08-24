# Render + Neon QA deployment

This runbook creates a temporary public QA environment. It is not a production deployment.

## Before you begin

- Use test-only Warevanta data. Do not upload customer production data.
- Create free accounts at [Neon](https://neon.com) and [Render](https://render.com) using the GitHub account that can access `chesterlouie/stockflow-wms`.
- No domain is required. Render provides an HTTPS `onrender.com` address.

## 1. Create the Neon database

1. In Neon, create a project named `warevanta-qa` in the Singapore region when available.
2. Copy its connection string. Make sure it ends with `sslmode=require`.
3. Keep it ready as `DATABASE_ADMIN_URL`. Render generates the restricted application password, and Warevanta creates the application connection at startup.

## 2. Create the Render Blueprint

1. In Render, choose **New +** then **Blueprint**.
2. Connect GitHub and select the private `chesterlouie/stockflow-wms` repository and its `main` branch.
3. Render detects `render.yaml`. Keep the **Free** instance plan.
4. Enter values for the prompted settings:

   | Render setting | Value |
   | --- | --- |
   | `DATABASE_ADMIN_URL` | Neon admin connection string |

5. Create the Blueprint. The first deployment builds Warevanta, creates the application database role, applies migrations, and starts the app.
6. When the status is **Live**, open the public service address and register a new QA workspace.

## 3. QA operating rules

- Render sleeps after 15 minutes without activity. The first request afterward can take about a minute.
- Neon pauses after inactivity as well. The first signed-in action can be slower after a pause.
- Keep `REPORT_DELIVERY_ENABLED=false`; email and automated report delivery are intentionally disabled for this free QA environment.
- Export a database backup each week and before any major schema change. Use Neon's dashboard export or `pg_dump` with `DATABASE_ADMIN_URL`.
- Monitor Neon storage and compute use. The free plan is capped, so it is intended for a small, intermittent QA team.

## 4. End of QA or production move

Before the free environment is removed, take one final PostgreSQL backup. The same backup can be restored to the later production database, then Warevanta can be deployed with production email, billing, backups, monitoring, and a custom domain.
