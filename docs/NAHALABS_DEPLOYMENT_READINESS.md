# NahaLabs deployment readiness — GrowChief

Status: **not deployed**. This document records the deployment checks completed for the NahaLabs fork and the conditions that must be met before exposing it publicly.

Repository: https://github.com/Naha1981/growchief-nahalabs

## Decision

Do not deploy the stock Compose stack publicly or create a frontend-only Render service and call it complete. GrowChief is a multi-process application, not a single web server: frontend, backend, orchestrator/worker, PostgreSQL, and Temporal are required. The supplied Compose stack also includes Elasticsearch for Temporal visibility.

## Confirmed repository facts

- Root package declares Node.js `>=20 <21` and pnpm `10.7.0`. Use Node 20 unless the project is deliberately upgraded and verified; do not assume Node 24 is compatible.
- Root package scripts build the frontend, backend, and orchestrator; Prisma schema is referenced as `./schema.prisma` (not `prisma/schema.prisma`).
- `docker-compose.yml` starts the application plus its own PostgreSQL, Temporal server, Temporal PostgreSQL, Elasticsearch, Temporal admin tools, and Temporal UI.
- Compose contains development credentials, including `AUTH_SECRET: "YourSpecialString!@#111"`, predictable database passwords, and example Google OAuth values. These are not production secrets.
- The root `.env.example` lists database, auth, storage, URL, email, OAuth, newsletter, browser/data-provider and OpenAI settings. Several are feature-specific; they must be classified by code path before deciding which are truly optional.
- The compose configuration uses a self-hosted Temporal endpoint (`temporal:7233`). Switching to Temporal Cloud is not just changing a URL: the worker/client connection code must support the Cloud namespace, TLS and authentication settings. That has not yet been verified.
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
- Decide whether Temporal will be self-hosted or Temporal Cloud. For Cloud, verify TLS/namespace/API-key support in the actual code before configuring a deployment.
- Confirm health checks, migrations, worker startup, file uploads, sign-in, and a harmless end-to-end workflow before enabling any outbound social actions.
- Keep social automation paused until account authorization, platform terms, rate limits, and opt-out controls are reviewed.

## Next engineering steps

1. Inspect `schema.prisma`, all Temporal connection/client setup, runtime config validation, and upload handling.
2. Trace each environment variable to its use and classify it as required, optional, or feature-gated.
3. Select a hosting topology that can keep the backend and orchestrator running, provides durable storage, and secures Temporal.
4. Add deployment configuration only after those checks; then run builds and a smoke test before creating public services.

## Current state

No Render resources were created or changed as part of this audit. No production secrets were generated or stored. This file is a readiness record, not a claim that deployment or runtime testing has succeeded.
