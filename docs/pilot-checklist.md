# Compensation Planner Pilot Checklist (Backend/UAT)

## 1) Required environment setup

```bash
npm ci
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/client/.env.example apps/client/.env.local
npm run dev:postgres
```

Start API/client after migrations:

```bash
npm run dev:api
npm run dev:client
```

## 2) Migrations

Run all migrations before any pilot verification:

```bash
npm run db:migrate
```

(Alternative via Docker)

```bash
npm run db:migrate:docker
```

## 3) Create a compensation cycle

Use admin identity and create the cycle:

```bash
curl -sS -X POST http://localhost:4000/api/v1/compensation/cycles \
  -H 'Content-Type: application/json' \
  -H 'x-demo-user-email: admin@demo.com' \
  -d '{"name":"2026 Pilot Cycle","status":"open","cycleType":"merit"}'
```

Capture the returned `id` for later steps.

## 4) Import employees (historical dataset)

Fast-path script for historical CSV imports:

```bash
npm run pilot:load-historical -- ./data/employees.csv "pilot-historical-dataset"
```

This runs preview + commit against `/api/v1/employees/import-csv` as `admin@demo.com` by default.

## 5) Run parity review

Compare expected values by employee/field:

```bash
curl -sS -X POST http://localhost:4000/api/v1/compensation/cycles/<CYCLE_ID>/parity-review \
  -H 'Content-Type: application/json' \
  -H 'x-demo-user-email: admin@demo.com' \
  -d @expected-parity.json
```

`expected-parity.json` payload shape:

```json
{
  "expected": [
    {
      "employeeId": "E123",
      "fields": {
        "derivedFinalTotalBonusProrated": 12000,
        "derivedFinalSalaryWithPromo": 145000
      }
    }
  ]
}
```

## 6) Export comparison against legacy spreadsheet outputs

Use the helper script against `/export-compare`:

```bash
npm run pilot:export-compare -- <CYCLE_ID> ./legacy-export-expected.json derivedFinalSalaryWithPromo,derivedFinalTotalBonusProrated
```

Expected file shape (`legacy-export-expected.json`) is the same `expected` array used by parity review.

## 7) Export final summary

Structured export for audit/UAT:

```bash
curl -sS http://localhost:4000/api/v1/compensation/cycles/<CYCLE_ID>/total-summary.export \
  -H 'x-demo-user-email: admin@demo.com'
```

CSV export for external sharing:

```bash
curl -sS http://localhost:4000/api/v1/compensation/cycles/<CYCLE_ID>/total-summary.csv \
  -H 'x-demo-user-email: admin@demo.com' \
  -o compensation-total-summary.csv
```
