# Architecture

## Monorepo layout

- `apps/web`: TypeScript Express web server responsible for serving the UI shell and exposing a `/health` endpoint.
- `apps/api`: TypeScript Express API service with PostgreSQL connectivity and `/health` endpoint that validates DB access.
- `infra/postgres/migrations`: SQL bootstrap scripts automatically executed by the Postgres container.
- `.github/workflows/ci.yml`: CI automation for lint, formatting, type checks, and tests.
- Root tooling (`package.json`, `eslint.config.js`, `tsconfig.base.json`, `.prettierrc.json`): shared quality gates for all workspaces.

## Service boundaries

- **web**: presentation-tier process that points at the API using `API_BASE_URL`.
- **api**: backend process handling requests and integrating with Postgres via `DATABASE_URL`.
- **postgres**: relational data store running as a separate container volume-backed by `postgres_data`.

## Auth and RBAC model

Current scaffold does not yet implement authentication. The intended model is:

1. API validates user identity (JWT/OIDC/session provider).
2. API maps identities to roles (`admin`, `manager`, `viewer`) stored in Postgres.
3. API enforces role checks per route with middleware.
4. Web requests role-aware capabilities from API and renders authorized views only.

This keeps authorization centralized in `apps/api` and avoids trusting client-side role checks.

## Data flow

1. User sends request to `web` (`:3000`).
2. Web-generated UI (or server-side request) uses `API_BASE_URL` to communicate with `api` (`:4000`).
3. API route handlers call PostgreSQL through the pooled `pg` client.
4. PostgreSQL persists state and responds to API queries.
5. API returns JSON payloads to web.
6. Web renders responses to the user.
