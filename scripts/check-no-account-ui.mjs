// After `npm run build` WITHOUT NEXT_PUBLIC_ACCOUNTS_ENABLED: proves no account UI or account route is in the build.
// Usage: node scripts/check-no-account-ui.mjs   (exits 1 and lists the files that contain account code)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = [
  '/api/account/', "Don't use your real name", 'Make my account', "I've written it down", 'Signed in as', 'recovery code',
  // P1-03: saving progress to an account (the sync engine, its storage keys and its words).
  'Saved to your account', 'Waiting to save', 'also in your account', "Add this device's progress", 'mtn:v1:outbox', 'mtn:v1:sync-owner', 'mtn:v1:guest-stash',
  // P1-16: export and delete (their words, the download's file name and the confirmation).
  'Download my data', 'Delete my account', 'Type your code name to confirm', 'Your account and everything in it has been deleted', 'music-theory-now-data-',
];
const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(js|html|rsc|json|txt|map)$/.test(name) && !name.endsWith('.nft.json')) {
      const text = readFileSync(p, 'utf8');
      for (const m of MARKERS) if (text.includes(m)) hits.push(`${p}: ${m}`);
    }
  }
}
for (const d of ['.next/static', '.next/server/app', '.next/server/chunks']) {
  try { walk(d); } catch { /* directory absent */ }
}
// P1-17: the common-password list is server side only. Distinctive entries must not be in anything the browser downloads,
// whether or not accounts are switched on.
const LIST_MARKERS = ['trustno1', 'mustang1', 'starwars1', 'whatever1', 'michelle1', 'jennifer1'];
const listHits = [];
function walkStatic(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkStatic(p);
    else if (/\.(js|html|json|txt|map)$/.test(name)) {
      const text = readFileSync(p, 'utf8');
      for (const m of LIST_MARKERS) if (text.includes(`'${m}'`) || text.includes(`"${m}"`)) listHits.push(`${p}: ${m}`);
    }
  }
}
try { walkStatic('.next/static'); } catch { /* directory absent */ }
if (listHits.length) {
  console.error('The common-password list is in the browser bundle:\n' + listHits.join('\n'));
  process.exit(1);
}
const routes = readFileSync('.next/app-path-routes-manifest.json', 'utf8');
if (/\/account|\/api\/account/.test(routes)) hits.push('.next/app-path-routes-manifest.json lists an account route');
if (hits.length) {
  console.error('Account code found in a build made without the switch:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('OK: no account UI or routes in this build.');
