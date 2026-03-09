import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const csvPath = resolve(__dirname, '../../data/employees.csv');
const staticCsv = existsSync(csvPath) ? readFileSync(csvPath, 'utf-8') : '';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves from /profile/ (repo name).
  // Override with VITE_BASE_URL env var if deploying elsewhere.
  base: process.env.VITE_BASE_URL ?? '/profile/',
  define: {
    // Bake the CSV contents into the static build so GitHub Pages works without an API.
    __STATIC_CSV__: JSON.stringify(staticCsv),
  },
});
