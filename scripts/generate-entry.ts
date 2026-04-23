/**
 * Generate .notis/_entry.tsx for a Notis app by re-exporting each route's
 * default-exported page component. Mirrors the CLI's behaviour so the app can
 * build inside this repo without depending on the CLI.
 *
 * Usage:
 *   tsx scripts/generate-entry.ts apps/<slug>
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function exportNameFromPath(path: string): string {
  const cleaned = path.replace(/[^a-zA-Z0-9]/g, '_');
  return cleaned && /^[a-zA-Z_]/.test(cleaned) ? cleaned : `Route${cleaned}`;
}

const appPath = process.argv[2];
if (!appPath) {
  console.error('Usage: tsx scripts/generate-entry.ts apps/<slug>');
  process.exit(1);
}

const absolute = resolve(process.cwd(), appPath);
const configPath = join(absolute, 'notis.config.ts');
if (!existsSync(configPath)) {
  console.error(`notis.config.ts not found at ${configPath}`);
  process.exit(1);
}

const module = await import(pathToFileURL(configPath).href);
const manifest = module.default as {
  routes?: Array<{ path: string; slug: string; exportName?: string }>;
};
const routes = manifest.routes ?? [];

const entryDir = join(absolute, '.notis');
mkdirSync(entryDir, { recursive: true });

const lines: string[] = [];
const layoutPath = join(absolute, 'app', 'layout.tsx');
if (existsSync(layoutPath)) {
  lines.push(`export { default as __AppShell } from '../app/layout';`);
}
for (const route of routes) {
  const pagePath = route.path === '/' ? '../app/page' : `../app${route.path}/page`;
  const exportName = route.exportName || exportNameFromPath(route.path);
  lines.push(`export { default as ${exportName} } from '${pagePath}';`);
}

writeFileSync(join(entryDir, '_entry.tsx'), lines.join('\n') + '\n');
console.log(`generate-entry: ${appPath} -> ${routes.length} route(s)`);
