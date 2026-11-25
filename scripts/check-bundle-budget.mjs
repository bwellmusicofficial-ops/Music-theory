// After `npm run build`: checks the first-load JavaScript of every route against a budget, and that the heavy
// libraries stay out of the pages that do not need them. Exits 1 with a plain-English list of what is over.
// Usage: node scripts/check-bundle-budget.mjs
//
// "First-load JS" is what Next lists for a route in .next/diagnostics/route-bundle-stats.json: the scripts the page
// needs before it can run (React, Next, the shared code and the route's own code), measured here gzipped, which is
// what a phone downloads. Code loaded later by `import()` (VexFlow when a stave is drawn, Tone for sound) is not in
// that list, which is the point: the second check below fails if either ever ends up in it.
//
// Budgets sit a little above the numbers measured when they were set (P1-17, 25 Nov 2026). When a change makes a page
// heavier on purpose, raise its line here in the same commit and say why in the message. docs/architecture.md,
// "Performance budget", explains how to read the numbers.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Gzipped first-load JS per route, in KB (1 KB = 1024 bytes). */
const ROUTE_BUDGET_KB = {
  '/': 250,
  '/learn': 185,
  '/learn/[grade]/[unit]': 185,
  '/library': 285,
  '/games': 180,
  '/games/note-rush': 225,
  '/games/key-hunt': 225,
  '/games/tap-it': 235,
  '/games/term-blitz': 245,
  '/mock': 240,
  '/mock/[id]': 330,
  '/lessons': 172,
  '/lessons/[id]': 310,
  '/settings': 185,
  '/accessibility': 172,
  '/privacy': 172,
  '/terms': 172,
  '/_not-found': 165,
};
/** A route that is not in the table must still be lean: add it above once its size is known. */
const DEFAULT_BUDGET_KB = 250;

/** Async chunks that load on demand: how big each may grow (a library upgrade is the usual cause). */
const ASYNC_BUDGET_KB = { vexflow: 410, tone: 90 };

/** Text that only the library itself contains, so a chunk holding it is that library. */
const MARKERS = {
  vexflow: ['BadArguments'],
  tone: ['Tone.js', 'AudioWorklet'],
  zod: ['$ZodType', 'ZodError'],
};

/** Routes that never show a lesson: they must not download zod (the lesson file checker, about 40 KB gzipped). */
const NO_ZOD_ROUTES = new Set([
  '/learn',
  '/learn/[grade]/[unit]',
  '/games',
  '/lessons',
  '/settings',
  '/accessibility',
  '/privacy',
  '/terms',
  '/_not-found',
]);

const STATS = '.next/diagnostics/route-bundle-stats.json';
const CHUNKS = '.next/static/chunks';

if (!existsSync(STATS)) {
  console.error(`${STATS} not found. Run "npm run build" first (it writes this file).`);
  process.exit(1);
}

const kb = (bytes) => bytes / 1024;
const text = (path) => readFileSync(path, 'utf8');
const gz = (path) => gzipSync(readFileSync(path)).length;
const has = (source, kind) => MARKERS[kind].some((m) => source.includes(m));

const problems = [];
const rows = [];
const stats = JSON.parse(text(STATS));
for (const { route, firstLoadChunkPaths } of stats) {
  const budget = ROUTE_BUDGET_KB[route] ?? DEFAULT_BUDGET_KB;
  const size = kb(firstLoadChunkPaths.reduce((sum, p) => sum + gz(p), 0));
  rows.push({ route, size, budget });
  if (size > budget) {
    problems.push(
      `${route}: ${size.toFixed(0)} KB of JavaScript to load, budget ${budget} KB.` +
        (route in ROUTE_BUDGET_KB ? '' : ' (This route has no line in ROUTE_BUDGET_KB; the default applies.)'),
    );
  }
  for (const p of firstLoadChunkPaths) {
    const source = text(p);
    for (const kind of ['vexflow', 'tone']) {
      if (has(source, kind)) problems.push(`${route}: ${kind === 'vexflow' ? 'VexFlow' : 'Tone'} is loaded up front (${p}). It must only load on demand, with import().`);
    }
    if (NO_ZOD_ROUTES.has(route) && has(source, 'zod')) {
      problems.push(`${route}: zod is loaded up front (${p}). Something on this page imports lesson/schema.ts or zod: import the constants from lesson/vocab.ts instead.`);
    }
  }
}

// The on-demand libraries themselves.
const biggest = { vexflow: 0, tone: 0 };
for (const name of readdirSync(CHUNKS).filter((n) => n.endsWith('.js'))) {
  const path = join(CHUNKS, name);
  const source = text(path);
  for (const kind of Object.keys(biggest)) if (has(source, kind)) biggest[kind] = Math.max(biggest[kind], kb(gz(path)));
}
for (const [kind, limit] of Object.entries(ASYNC_BUDGET_KB)) {
  if (biggest[kind] === 0) problems.push(`The ${kind} chunk was not found in ${CHUNKS}: its marker text in this script is out of date.`);
  else if (biggest[kind] > limit) problems.push(`The ${kind} chunk is ${biggest[kind].toFixed(0)} KB, budget ${limit} KB.`);
}

for (const r of rows.sort((a, b) => b.size - a.size)) {
  console.log(`${r.route.padEnd(24)} ${r.size.toFixed(0).padStart(4)} KB gz  (budget ${r.budget})`);
}
console.log(`${'VexFlow chunk (on demand)'.padEnd(24)} ${biggest.vexflow.toFixed(0).padStart(4)} KB gz  (budget ${ASYNC_BUDGET_KB.vexflow})`);
console.log(`${'Tone chunk (on demand)'.padEnd(24)} ${biggest.tone.toFixed(0).padStart(4)} KB gz  (budget ${ASYNC_BUDGET_KB.tone})`);

if (problems.length) {
  console.error('\nBundle budget exceeded:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('\nBundle budget met.');
