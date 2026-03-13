#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000';
const userEmail = process.env.DEMO_USER_EMAIL ?? 'admin@demo.com';
const filePath = process.argv[2] ?? 'data/employees.csv';
const sourceName = process.argv[3] ?? 'pilot-historical-dataset';

async function main() {
  await readFile(filePath, 'utf8');

  const previewResponse = await fetch(`${baseUrl}/api/v1/employees/import-csv`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-email': userEmail
    },
    body: JSON.stringify({ action: 'preview', filePath, sourceName })
  });
  const preview = await previewResponse.json();
  if (!previewResponse.ok || !preview?.success) {
    throw new Error(`Preview failed: ${previewResponse.status} ${JSON.stringify(preview)}`);
  }

  const commitResponse = await fetch(`${baseUrl}/api/v1/employees/import-csv`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-email': userEmail
    },
    body: JSON.stringify({ action: 'commit', filePath, sourceName })
  });
  const commit = await commitResponse.json();
  if (!commitResponse.ok || !commit?.success) {
    throw new Error(`Commit failed: ${commitResponse.status} ${JSON.stringify(commit)}`);
  }

  console.log(JSON.stringify({
    preview: preview.data,
    commit: {
      rowsReceived: commit.data?.rowsReceived,
      rowsInserted: commit.data?.rowsInserted,
      rowsUpdated: commit.data?.rowsUpdated,
      batchId: commit.data?.batchId
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
