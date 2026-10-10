# NahaLabs deployment readiness — GrowChief

Status: **not deployed**. This document records the deployment checks completed for the NahaLabs fork and the conditions that must be met before exposing it publicly.

Repository: https://github.com/Naha1981/growchief-nahalabs

## Decision

Do not deploy the stock Compose stack publicly or create a frontend-only Render service and call it complete. GrowChief is a multi-process application, not a single web server: frontend, backend, orchestrator/worker, PostgreSQL, and Temporal are required. The supplied Compose stack also includes Elasticsearch for Temporal visibility.

## Confirmed repository facts

- Root package declares Node.js `>=20 <21` and pnpm `10.7.0`. Use Node 20 unless the project is deliberately upgraded and verified; do not assume Node 24 is compatible.
- Root package scripts build the frontend, backend, and orchestrator; Prisma schema is referenced as `./schema.prisma` (not `prisma/schema.prisma`).
- `docker-compose.yml` starts the application plus its own PostgreSQL, Temporal server, Temporal PostgreSQL, Elasticsearch, Temporal admin tools, and Temporal UI.
- Compose contains development credentials, including `AUTH_SECRET: "YourSpecialString!@#111"`, predictable database passwords, and example Google OAuth values. These are not production secrets. It also publishes ports for GrowChief (`5002`), Temporal (`7233`) and Temporal UI (`8080`); bind/protect management and internal ports rather than exposing them publicly.
- The root `.env.example` lists database, auth, storage, URL, email, OAuth, newsletter, data-provider and OpenAI settings. `DATABASE_URL` is used by Prisma; `STORAGE_PROVIDER` defaults to `local`; Cloudflare mode constructs an S3 client from account ID, access key, secret key, region, bucket name and bucket URL. `FRONTEND_URL` controls backend CORS. The frontend's `VITE_BACKEND_URL` and `VITE_PUBLIC_WS` are build-time endpoint settings. Google OAuth, email/newsletter, and data-provider keys are feature-dependent; complete usage tracing remains outstanding.
- The Temporal module in `shared/server/temporal/temporal.module.ts` passes only `address` and `namespace` to `nestjs-temporal-core`; it does not configure TLS or API-key authentication. The current code therefore does not establish a working Temporal Cloud connection. Treat self-hosted Temporal as the only verified direction unless Cloud support is implemented and tested.
- The backend starts an HTTP server on `PORT` or 3000; the orchestrator starts as a Nest application context and relies on Temporal worker registration to start its worker. The repository does not yet demonstrate a deployment-ready health/readiness endpoint or successful live dependency checks. Registration is enabled by default: `canRegister()` returns `!process.env.DISABLE_REGISTRATION`; set `DISABLE_REGISTRATION` to a non-empty value after controlled initial setup if public self-registration is not intended.
- The frontend build uses Vite and requires `VITE_BACKEND_URL` and `VITE_PUBLIC_WS` to point at the deployed backend/websocket endpoint. Backend CORS is derived from `FRONTEND_URL`.
- The source repository is AGPL-3.0. Review licence obligations before offering a modified hosted version to third parties.

## Hosting assessment

Render Free is not a suitable production home for this full stack:
- Free web services can sleep when idle and have ephemeral filesystems.
- Free PostgreSQL expires after 30 days and does not provide the production durability/backups this app needs.
- Persistent disks and the private networking/service topology needed for a reliable multi-service deployment require careful plan selection.
- Do not reuse another NahaLabs project's database.

A single Render web service cannot safely replace the complete Compose topology. A production design needs separately managed app processes, durable PostgreSQL, persistent upload storage, and a reachable secured Temporal service. Elasticsearch/Temporal visibility also needs an explicit decision.

## Secret and configuration checklist

Before any public deployment:
- Generate a unique high-entropy `AUTH_SECRET`; never reuse the Compose sample.
- Create a dedicated production PostgreSQL database and use its private/internal connection string where supported.
- Configure the public frontend/backend URLs and websocket URL consistently.
- Decide on persistent object storage (the repository supports local or Cloudflare S3-compatible storage); local container storage is not durable on ephemeral hosts.
- Configure Google OAuth only if Google sign-in is required; set exact production callback URLs.
- Configure email/newsletter and data-provider keys only if the enabled features need them. Never commit credentials into Git.
- Plan on self-hosted Temporal for the current code, or first implement and test Temporal Cloud TLS/authentication support. Do not point this configuration at a Cloud endpoint and assume it is secure or compatible.
- Confirm health checks, migrations, worker startup, file uploads, sign-in, and a harmless end-to-end workflow before enabling any outbound social actions.
- Keep social automation paused until account authorization, platform terms, rate limits, and opt-out controls are reviewed.

## Next engineering steps

1. Finish tracing environment variables, authentication/session configuration, and feature-specific integrations.
2. Decide a hosting topology that keeps backend and orchestrator processes alive, provides durable storage, and secures Temporal.
3. Establish a safe production database initialization path. No Prisma migrations directory was found in the inspected repository tree; do not assume `prisma db push` is a reviewed migration strategy for production.
4. Add or verify runtime health/readiness checks and test worker connectivity, uploads, authentication and one harmless workflow.
5. Run a live smoke test against dedicated infrastructure before enabling any social actions or calling the deployment complete.

## Current state

A GitHub Actions build workflow has been added on the readiness branch. The first successful remote run completed dependency installation and built the frontend, backend, and orchestrator (run: https://github.com/Naha1981/growchief-nahalabs/actions/runs/38051200823). The follow-up run for the latest Prisma pin/docs commit also passed all steps, including dependency installation and the application build (run: https://github.com/Naha1981/growchief-nahalabs/actions/runs/38052091131). The root Prisma generate/db-push scripts are pinned to Prisma 6.13.0 to match `@prisma/client`. The workflow now additionally validates `schema.prisma` with Prisma 6.13.0 before building. Latest run 38052288448 passed dependency installation, Prisma schema validation and application build: https://github.com/Naha1981/growchief-nahalabs/actions/runs/38052288448. This is a build/schema check only, not a runtime/integration test. No Render resources were created or changed as part of this audit. No production secrets were generated or stored. This file is a readiness record, not a claim that deployment or runtime testing has succeeded.
