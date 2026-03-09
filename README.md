# MeritCycle MVP (Local Full-Stack)

Internal merit/bonus planning MVP for local testing.

This repository contains:
- `apps/client`: React + Vite UI (main local app)
- `apps/api`: Express + TypeScript API
- `infra/postgres/migrations`: PostgreSQL schema and seed migration SQL
- `data/employees.csv`: employee roster source file watched by the API

---

## 1) Prerequisites

- Node.js 22+
- npm 10+
- Docker + Docker Compose

---

## 2) Happy-path local run (recommended)

### Step A: install dependencies

```bash
npm ci
```

### Step B: create local env files

```bash
cp .env.example .env
cp apps/client/.env.example apps/client/.env.local
cp apps/api/.env.example apps/api/.env
```

### Step C: start PostgreSQL

```bash
npm run dev:postgres
```

### Step D: run DB migrations

```bash
npm run db:migrate
```

### Step E: start API (terminal 1)

```bash
npm run dev:api
```

### Step F: start client (terminal 2)

```bash
npm run dev:client
```

### Step G: open app

- `http://localhost:5173`

The API watches `data/employees.csv` and reloads employee data automatically after file updates.

---

## 3) Core MVP workflow to test

1. Open Dashboard.
2. Go to Employees and verify roster loads from `data/employees.csv`.
3. Go to Merit and edit recommendation values.
4. Save recommendations.
5. Go to Admin and update cycle settings, then save.
6. Check Dashboard/Executive pages for budget/summary rollups.

---

## 4) Environment variables

### API (`apps/api/.env`)
- `PORT` (default `4000`)
- `DATABASE_URL` (required)
- `NODE_ENV` (default `development`)

### Client (`apps/client/.env.local`)
- `VITE_API_URL` (set for local full-stack mode)
- `VITE_BASE_URL` (`/` for local, `/profile/` for GH Pages)

---

## 5) Useful scripts

From repo root:

```bash
npm run dev:postgres   # start postgres only
npm run db:migrate     # apply all SQL migrations in order
npm run dev:api        # run API in watch mode
npm run dev:client     # run client in Vite dev mode
npm run test --workspace=api
npm run typecheck --workspace=api
```

---

## 6) Troubleshooting

### API says database connection failed
- Ensure postgres is running: `docker compose ps`
- Ensure `DATABASE_URL` points to `localhost:5432` for local dev
- Re-run migrations: `npm run db:migrate`

### Employees page is empty
- Confirm file exists: `data/employees.csv`
- Check API logs for `[csvWatcher]` warnings about malformed or missing columns
- Required CSV columns: at least `name` and `salary`

### Client can’t load data
- Confirm API is up at `http://localhost:4000/health`
- Confirm `apps/client/.env.local` contains `VITE_API_URL=http://localhost:4000`
- Restart client after env changes

### Need static/demo mode
- Remove `VITE_API_URL` from client env to use bundled CSV + localStorage fallback.

---

## 7) Key files for beginners

- API entry: `apps/api/src/index.ts`
- API routes: `apps/api/src/routes/*`
- CSV watcher: `apps/api/src/csvWatcher.ts`
- Client entry: `apps/client/src/main.tsx`
- Client API layer: `apps/client/src/api/client.ts`
- Main pages: `apps/client/src/pages/*`
- DB migrations: `infra/postgres/migrations/*.sql`

## 8) Beginner notes on env files

Edit these files only if you need non-default ports/credentials:

- `.env` (shared Docker/database defaults)
- `apps/api/.env` (API runtime vars; loaded automatically when API starts)
- `apps/client/.env.local` (client runtime vars for Vite)
