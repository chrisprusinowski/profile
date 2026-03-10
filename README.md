# MeritCycle MVP (PostgreSQL-first local demo)

Internal merit/bonus planning tool for local full-stack demos.

## What changed in this demo-ready setup

- PostgreSQL is the **primary source of truth** for employees, cycle settings, and recommendations.
- `data/employees.csv` is now **import-only** (seed/input), not live storage.
- Employee CRUD is available through the API and client UI.

---

## 1) Install dependencies

```bash
npm ci
```

## 2) Create local env files

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/client/.env.example apps/client/.env.local
```

Ensure `apps/client/.env.local` includes:

```bash
VITE_API_URL=http://localhost:4000
```

## 3) Start PostgreSQL

```bash
npm run dev:postgres
```

## 4) Run migrations

```bash
npm run db:migrate
```

## 5) Start API

```bash
npm run dev:api
```

## 6) Start client

```bash
npm run dev:client
```

Open: `http://localhost:5173`

---

## 7) Import employee CSV into PostgreSQL

### Option A (UI)
1. Open **Employees** page.
2. Paste CSV text into **Import Employees from CSV**.
3. Click **Import CSV to PostgreSQL**.

Required CSV columns:

`id, name, email, department, title, salary, manager, hire_date`

### Option B (API)

```bash
curl -X POST http://localhost:4000/api/v1/employees/import-csv \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "filePath": "./data/employees.csv"
}
JSON
```

---

## 8) Demo employee add/edit/delete

1. Go to **Employees**.
2. Use **Add / Edit Employee** form to add a record.
3. Click **Edit** on a row and save changes.
4. Click **Delete** and confirm removal.

All changes persist in PostgreSQL.

---


## 9) Demo role-based access (local MVP)

This repo now includes a demo-only role model backed by PostgreSQL `app_users` and request header identity (`x-demo-user-email`).

### Roles
- `admin`: full access, can edit cycle settings, employee CRUD/import, and manage app users.
- `executive`: read-only access to all employees/recommendations and reporting views.
- `manager`: scoped to employees where `employees.manager` matches `app_users.manager_name`; can edit recommendations for that scoped team only.

### Seeded demo users
- `admin@demo.com` → `admin`
- `executive@demo.com` → `executive`
- `manager1@demo.com` → `manager` (scope: `Jamie Rivera`)
- `manager2@demo.com` → `manager` (scope: `Jordan Pike`)

The client includes a **Local Demo Mode** user switcher in the sidebar so you can quickly switch users for demos.

---

## 10) Helpful API endpoints

- `GET /api/v1/employees`
- `POST /api/v1/employees`
- `PUT /api/v1/employees/:id`
- `DELETE /api/v1/employees/:id`
- `POST /api/v1/employees/import-csv`
- `GET /api/v1/cycle`
- `POST /api/v1/cycle`
- `GET /api/v1/recommendations`
- `PUT /api/v1/recommendations/:employeeId`

---

## 11) Known limitations (intentional for MVP)

- No production authentication/SSO yet (current identity is demo-only header-based switching).
- CSV import currently supports JSON payload (`csvContent` or `filePath`) rather than multipart upload.
- Basic single-instance local workflow; no advanced concurrency controls.
- No CSV write-back to disk.
