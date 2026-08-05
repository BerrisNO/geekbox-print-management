#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Bundle-size budget gate (frontend spec §13): the INITIAL JS payload
 * (entry chunk + its static imports, i.e. the shell/router/query core that
 * loads on first paint) must be < 200 KB gzipped. Route chunks are lazy and
 * excluded. Fails the build (exit 1) when exceeded.
 *
 * Reads Vite's build manifest to identify the entry chunk and its import graph,
 * then sums the gzipped size of those files in dist/assets.
 */
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BUDGET_BYTES = 200 * 1024;

const manifestPath = ['.vite/manifest.json', 'manifest.json']
  .map((p) => join(DIST, p))
  .find((p) => existsSync(p));

if (!manifestPath) {
  console.error(
    'bundle-budget: no build manifest found in dist/. Run `vite build` (with build.manifest enabled) first.',
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Find the entry chunk.
const entry = Object.values(manifest).find((c) => c.isEntry);
if (!entry) {
  console.error('bundle-budget: no entry chunk in manifest.');
  process.exit(1);
}

// Walk static imports (initial graph). Dynamic imports are excluded (lazy routes).
const seen = new Set();
const initialFiles = new Set();

function walk(key) {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk) return;
  if (chunk.file?.endsWith('.js')) initialFiles.add(chunk.file);
  for (const imp of chunk.imports ?? []) walk(imp);
}

walk(Object.keys(manifest).find((k) => manifest[k].isEntry));

let total = 0;
for (const file of initialFiles) {
  const buf = readFileSync(join(DIST, file));
  const gz = gzipSync(buf).length;
  total += gz;
  console.log(`  ${file}  ${(gz / 1024).toFixed(1)} KB gz`);
}

const kb = (total / 1024).toFixed(1);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);
console.log(`\nInitial JS: ${kb} KB gzipped (budget ${budgetKb} KB)`);

if (total > BUDGET_BYTES) {
  console.error(`bundle-budget: FAIL — initial JS ${kb} KB exceeds ${budgetKb} KB budget.`);
  process.exit(1);
}
console.log('bundle-budget: PASS');
