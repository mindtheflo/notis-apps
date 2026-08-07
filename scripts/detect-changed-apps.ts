/**
 * Outputs the list of app slugs that changed between two git refs.
 *
 * Usage:
 *   tsx scripts/detect-changed-apps.ts --base <sha> --head <sha> [--out $GITHUB_OUTPUT]
 *   tsx scripts/detect-changed-apps.ts --all [--out $GITHUB_OUTPUT]
 *
 * Writes two GitHub Actions outputs when --out is provided:
 *   apps=<json array of slugs>
 *   any=<"true"|"false">
 */
import { execSync } from 'node:child_process';
import { readdirSync, appendFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function listAllApps(): string[] {
  const appsRoot = join(process.cwd(), 'apps');
  try {
    return readdirSync(appsRoot).filter((entry) => {
      try {
        return statSync(join(appsRoot, entry)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function appStillExists(slug: string): boolean {
  return existsSync(join(process.cwd(), 'apps', slug, 'package.json'));
}

function changedAppsBetween(baseRef: string, headRef: string): string[] {
  const diff = execSync(`git diff --name-only ${baseRef} ${headRef} -- apps/`, {
    encoding: 'utf8',
  });
  const slugs = new Set<string>();
  for (const line of diff.split('\n')) {
    const match = /^apps\/([^/]+)\//.exec(line.trim());
    if (match && match[1]) slugs.add(match[1]);
  }
  // A removed app shows up in the diff but has nothing left to validate,
  // build, or publish. Without this guard CI schedules a matrix job for a
  // directory that no longer exists and fails on the install step.
  const removed: string[] = [];
  const present: string[] = [];
  for (const slug of [...slugs].sort()) {
    (appStillExists(slug) ? present : removed).push(slug);
  }
  if (removed.length > 0) {
    console.error(`detect-changed-apps: skipping removed app(s): ${removed.join(', ')}`);
  }
  return present;
}

function writeOutput(outPath: string, apps: string[]) {
  const payload = `apps=${JSON.stringify(apps)}\nany=${apps.length > 0 ? 'true' : 'false'}\n`;
  appendFileSync(outPath, payload);
}

const args = parseArgs(process.argv.slice(2));

let apps: string[];
if (args.all) {
  apps = listAllApps();
} else {
  const base = typeof args.base === 'string' ? args.base : '';
  const head = typeof args.head === 'string' ? args.head : 'HEAD';
  if (!base) {
    console.error('Missing --base <sha> (or pass --all).');
    process.exit(2);
  }
  apps = changedAppsBetween(base, head);
}

console.log(JSON.stringify({ apps, any: apps.length > 0 }, null, 2));
if (typeof args.out === 'string' && args.out) {
  writeOutput(args.out, apps);
}
