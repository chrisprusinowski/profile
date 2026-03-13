#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const [cycleIdArg, expectedPathArg, fieldsArg] = process.argv.slice(2);

if (!cycleIdArg || !expectedPathArg) {
  console.error('Usage: node scripts/pilot/export-compare.mjs <cycleId> <expected-json-path> [field1,field2,...]');
  process.exit(1);
}

const cycleId = Number(cycleIdArg);
if (!Number.isFinite(cycleId) || cycleId <= 0) {
  console.error(`Invalid cycleId: ${cycleIdArg}`);
  process.exit(1);
}

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000';
const userEmail = process.env.DEMO_USER_EMAIL ?? 'admin@demo.com';

async function main() {
  const expectedRaw = await readFile(expectedPathArg, 'utf8');
  const expected = JSON.parse(expectedRaw);
  const fields = fieldsArg ? fieldsArg.split(',').map((field) => field.trim()).filter(Boolean) : undefined;

  const response = await fetch(`${baseUrl}/api/v1/compensation/cycles/${cycleId}/export-compare`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-email': userEmail
    },
    body: JSON.stringify({ expected, fields })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Comparison failed: ${response.status} ${JSON.stringify(body)}`);
  }

  console.log(JSON.stringify(body.data, null, 2));
  if ((body.data?.mismatchCount ?? 0) > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
