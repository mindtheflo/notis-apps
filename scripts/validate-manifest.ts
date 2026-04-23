/**
 * Validate a single app's notis.config.ts manifest.
 *
 * Steps:
 *   1. Import the app's notis.config.ts (via tsx's on-the-fly TS support).
 *   2. Verify required fields (name, routes present, databases valid).
 *   3. Verify declared properties have unique keys and valid types.
 *   4. Fail the process with a non-zero exit code if anything is wrong.
 *
 * Usage:
 *   tsx scripts/validate-manifest.ts apps/<slug>
 */
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function die(message: string): never {
  console.error(`validate-manifest: ${message}`);
  process.exit(1);
}

const appPath = process.argv[2];
if (!appPath) die('Usage: tsx scripts/validate-manifest.ts apps/<slug>');

const absoluteAppPath = resolve(process.cwd(), appPath);
const configPath = join(absoluteAppPath, 'notis.config.ts');
if (!existsSync(configPath)) die(`notis.config.ts not found at ${configPath}`);

const packageJsonPath = join(absoluteAppPath, 'package.json');
if (!existsSync(packageJsonPath)) die(`package.json not found at ${packageJsonPath}`);

const packageJson = (await import(pathToFileURL(packageJsonPath).href, {
  with: { type: 'json' },
})).default as { name?: string; notisAppVersion?: string };

if (!packageJson.notisAppVersion) {
  die(`package.json is missing "notisAppVersion" (semver required)`);
}
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(packageJson.notisAppVersion)) {
  die(`"notisAppVersion" (${packageJson.notisAppVersion}) is not a valid semver`);
}

const module = await import(pathToFileURL(configPath).href);
const manifest = module.default as Record<string, unknown> | undefined;
if (!manifest || typeof manifest !== 'object') {
  die('notis.config.ts must export a default object');
}

if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
  die('manifest.name is required and must be a non-empty string');
}

if (manifest.routes !== undefined) {
  if (!Array.isArray(manifest.routes)) die('manifest.routes must be an array');
  const slugs = new Set<string>();
  for (const [i, routeRaw] of (manifest.routes as unknown[]).entries()) {
    const route = routeRaw as Record<string, unknown>;
    if (!route || typeof route !== 'object') die(`routes[${i}] must be an object`);
    if (typeof route.slug !== 'string' || !route.slug) die(`routes[${i}].slug is required`);
    if (typeof route.path !== 'string' || !route.path) die(`routes[${i}].path is required`);
    if (typeof route.name !== 'string' || !route.name) die(`routes[${i}].name is required`);
    if (slugs.has(route.slug)) die(`routes[${i}].slug "${route.slug}" is duplicated`);
    slugs.add(route.slug);
  }
}

if (manifest.databases !== undefined) {
  if (!Array.isArray(manifest.databases)) die('manifest.databases must be an array');
  const slugs = new Set<string>();
  for (const [i, entry] of (manifest.databases as unknown[]).entries()) {
    const slug = typeof entry === 'string' ? entry : (entry as Record<string, unknown>)?.slug;
    if (typeof slug !== 'string' || !slug) die(`databases[${i}] must be a string slug or { slug }`);
    if (slugs.has(slug)) die(`databases[${i}] slug "${slug}" is duplicated`);
    slugs.add(slug);
  }
}

if (manifest.properties !== undefined) {
  if (!Array.isArray(manifest.properties)) die('manifest.properties must be an array');
  const keys = new Set<string>();
  const validTypes = new Set(['string', 'secret', 'number', 'boolean', 'select', 'multi_select']);
  for (const [i, raw] of (manifest.properties as unknown[]).entries()) {
    const prop = raw as Record<string, unknown>;
    if (!prop || typeof prop !== 'object') die(`properties[${i}] must be an object`);
    if (typeof prop.key !== 'string' || !prop.key) die(`properties[${i}].key is required`);
    if (keys.has(prop.key)) die(`properties[${i}].key "${prop.key}" is duplicated`);
    keys.add(prop.key);
    if (typeof prop.type !== 'string' || !validTypes.has(prop.type)) {
      die(`properties[${i}].type must be one of ${[...validTypes].join(', ')}`);
    }
    if (typeof prop.label !== 'string' || !prop.label) die(`properties[${i}].label is required`);
    if (prop.type === 'select' || prop.type === 'multi_select') {
      if (!Array.isArray(prop.options) || prop.options.length === 0) {
        die(`properties[${i}].options is required for type=${prop.type}`);
      }
    }
  }
}

console.log(`validate-manifest: ${appPath} OK (${packageJson.notisAppVersion})`);
