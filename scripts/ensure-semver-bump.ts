/**
 * Verify an app's notisAppVersion in package.json is strictly greater than the
 * version on the base branch. Enforced by CI on every PR; prevents accidental
 * no-op publishes and catches downgrade attempts.
 *
 * Usage:
 *   tsx scripts/ensure-semver-bump.ts apps/<slug> --base <sha>
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function die(message: string): never {
  console.error(`ensure-semver-bump: ${message}`);
  process.exit(1);
}

function parseSemver(version: string): [number, number, number, string | null] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? null];
}

function compareSemver(a: [number, number, number, string | null], b: [number, number, number, string | null]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return (a[i]! as number) - (b[i]! as number);
  }
  // Pre-release: pre-release < release; lexicographic otherwise.
  if (a[3] === b[3]) return 0;
  if (a[3] === null) return 1;
  if (b[3] === null) return -1;
  return a[3] < b[3] ? -1 : 1;
}

const appPath = process.argv[2];
if (!appPath) die('Usage: tsx scripts/ensure-semver-bump.ts apps/<slug> --base <sha>');

const args = process.argv.slice(3);
let baseSha = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base' && args[i + 1]) {
    baseSha = args[i + 1] ?? '';
    i++;
  }
}
if (!baseSha) die('Missing --base <sha>');

const absolute = resolve(process.cwd(), appPath);
const packageJsonPath = join(absolute, 'package.json');
if (!existsSync(packageJsonPath)) die(`package.json not found at ${packageJsonPath}`);

const newPackage = (await import(pathToFileURL(packageJsonPath).href, {
  with: { type: 'json' },
})).default as { notisAppVersion?: string };
if (!newPackage.notisAppVersion) die('package.json is missing notisAppVersion');

const newParsed = parseSemver(newPackage.notisAppVersion);
if (!newParsed) die(`Invalid new semver: ${newPackage.notisAppVersion}`);

let oldVersion: string | null = null;
try {
  const relPath = `${appPath}/package.json`.replace(/^\/+/, '');
  const oldContents = execSync(`git show ${baseSha}:${relPath}`, { encoding: 'utf8' });
  const oldPackage = JSON.parse(oldContents) as { notisAppVersion?: string };
  oldVersion = oldPackage.notisAppVersion ?? null;
} catch {
  oldVersion = null; // New app: no baseline version.
}

if (!oldVersion) {
  console.log(`ensure-semver-bump: ${appPath} is a new app (version=${newPackage.notisAppVersion}); accepted.`);
  process.exit(0);
}

const oldParsed = parseSemver(oldVersion);
if (!oldParsed) die(`Base version was not valid semver: ${oldVersion}`);

const cmp = compareSemver(newParsed, oldParsed);
if (cmp <= 0) {
  die(`version must be strictly greater than base (${oldVersion}); got ${newPackage.notisAppVersion}`);
}

console.log(`ensure-semver-bump: ${appPath} ${oldVersion} -> ${newPackage.notisAppVersion} OK`);
