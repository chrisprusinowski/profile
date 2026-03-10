# Local Development

## Prerequisites

- Node.js 22+
- npm 10+
- Docker + Docker Compose plugin

## Initial setup

1. Copy env template:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

## Environment variables

| Variable            | Used by  | Description                           |
| ------------------- | -------- | ------------------------------------- |
| `WEB_PORT`          | web      | Port for web server (default `3000`). |
| `API_PORT`          | api      | Port for API server (default `4000`). |
| `API_BASE_URL`      | web      | Base URL where web reaches API.       |
| `DATABASE_URL`      | api      | Postgres connection string for API.   |
| `POSTGRES_DB`       | postgres | Postgres database name.               |
| `POSTGRES_USER`     | postgres | Postgres user name.                   |
| `POSTGRES_PASSWORD` | postgres | Postgres password.                    |

> `docker-compose.yml` currently sets container defaults directly. Override with an `.env` file and `${VAR}` substitutions if you need custom values.

## Run with Docker

Build and start all services:

```bash
docker compose up --build
```

Endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/health`
- Postgres: `localhost:5432`

Stop services:

```bash
docker compose down
```

## Run services without Docker

Start Postgres only:

```bash
docker compose up postgres -d
```

Run API:

```bash
DATABASE_URL=postgresql://app_user:app_password@localhost:5432/app_db PORT=4000 npm run dev --workspace=api
```

Run Web:

```bash
API_BASE_URL=http://localhost:4000 PORT=3000 npm run dev --workspace=web
```

## Migrations

Bootstrap migration scripts are in `infra/postgres/migrations` and auto-run on first DB init in Docker.

For local operators, migrations run through a Node runner (`scripts/migrate.mjs`) and do **not** require a local `psql` install.

Apply migrations against a DB running on localhost:

```bash
npm run db:migrate
```

Apply migrations through Docker (useful when you do not want Node/DB tooling on host):

```bash
npm run db:migrate:docker
```

## Workspace checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```
