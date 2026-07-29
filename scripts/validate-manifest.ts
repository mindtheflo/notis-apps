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
import { resolve, join, relative } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
const listingJsonPath = join(absoluteAppPath, 'notis-listing.json');
if (!existsSync(listingJsonPath)) die(`notis-listing.json not found at ${listingJsonPath}`);

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

const listing = JSON.parse(readFileSync(listingJsonPath, 'utf8')) as Record<string, unknown>;
const screenshots = listing.screenshots;
if (!Array.isArray(screenshots) || screenshots.length < 3 || screenshots.length > 6) {
  die('notis-listing.json must include 3-6 screenshots');
}
for (const [i, raw] of screenshots.entries()) {
  if (!raw || typeof raw !== 'object') die(`screenshots[${i}] must be an object`);
  const screenshot = raw as Record<string, unknown>;
  if (typeof screenshot.path !== 'string' || !screenshot.path) {
    die(`screenshots[${i}].path is required`);
  }
  if (typeof screenshot.alt !== 'string' || !screenshot.alt.trim()) {
    die(`screenshots[${i}].alt is required`);
  }
  const screenshotPath = resolve(absoluteAppPath, screenshot.path);
  const relativePath = relative(absoluteAppPath, screenshotPath);
  if (relativePath === '' || relativePath.startsWith('..')) {
    die(`screenshots[${i}].path escapes the app directory`);
  }
  if (!existsSync(screenshotPath)) die(`screenshots[${i}] not found: ${screenshot.path}`);
  if (statSync(screenshotPath).size > 2 * 1024 * 1024) {
    die(`screenshots[${i}] must be 2 MB or smaller`);
  }
  const png = readFileSync(screenshotPath);
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    die(`screenshots[${i}] must be a PNG`);
  }
  if (png.readUInt32BE(16) !== 2000 || png.readUInt32BE(20) !== 1250) {
    die(`screenshots[${i}] must be 2000x1250`);
  }
}

const manifestDatabases = Array.isArray(manifest.databases) ? manifest.databases : [];
const seedFlags = new Map<string, boolean>();
for (const entry of manifestDatabases) {
  if (typeof entry === 'string') {
    seedFlags.set(entry, false);
  } else if (entry && typeof entry === 'object') {
    const database = entry as Record<string, unknown>;
    const slug = database.slug;
    if (typeof slug === 'string') {
      seedFlags.set(slug, database.seedDocuments === true || database.seed_documents === true);
    }
  }
}

const installSnapshot = listing.install_snapshot;
if (!installSnapshot || typeof installSnapshot !== 'object') {
  die('notis-listing.json is missing install_snapshot; resubmit with the current Notis CLI');
}
const snapshot = installSnapshot as Record<string, unknown>;
if (!Array.isArray(snapshot.databases) || !Array.isArray(snapshot.documents)) {
  die('install_snapshot.databases and install_snapshot.documents must be arrays');
}
const snapshotDatabaseSlugs = new Set<string>();
const snapshotDatabaseSlugsById = new Map<string, string>();
for (const [i, raw] of snapshot.databases.entries()) {
  if (!raw || typeof raw !== 'object') die(`install_snapshot.databases[${i}] must be an object`);
  const database = raw as Record<string, unknown>;
  if (typeof database.id !== 'string' || !database.id) {
    die(`install_snapshot.databases[${i}].id is required`);
  }
  if (typeof database.slug !== 'string' || !seedFlags.has(database.slug)) {
    die(`install_snapshot.databases[${i}].slug must match a manifest database`);
  }
  if (!database.original_fields || typeof database.original_fields !== 'object') {
    die(`install_snapshot.databases[${i}].original_fields is required`);
  }
  if (snapshotDatabaseSlugs.has(database.slug)) {
    die(`install_snapshot database slug "${database.slug}" is duplicated`);
  }
  snapshotDatabaseSlugs.add(database.slug);
  snapshotDatabaseSlugsById.set(database.id, database.slug);
}
if (
  snapshotDatabaseSlugs.size !== seedFlags.size
  || [...seedFlags.keys()].some((slug) => !snapshotDatabaseSlugs.has(slug))
) {
  die('install_snapshot must include every manifest database exactly once');
}
if (snapshot.documents.length > 200) {
  die('install_snapshot may seed at most 200 documents');
}
const seededCounts = new Map<string, number>();
for (const [i, raw] of snapshot.documents.entries()) {
  if (!raw || typeof raw !== 'object') die(`install_snapshot.documents[${i}] must be an object`);
  const document = raw as Record<string, unknown>;
  const databaseSlug = typeof document.database_id === 'string'
    ? snapshotDatabaseSlugsById.get(document.database_id)
    : undefined;
  if (!databaseSlug || !seedFlags.get(databaseSlug)) {
    die(`install_snapshot.documents[${i}] targets a structure-only or unknown database`);
  }
  const nextCount = (seededCounts.get(databaseSlug) ?? 0) + 1;
  if (nextCount > 50) die(`install_snapshot may seed at most 50 documents per database`);
  seededCounts.set(databaseSlug, nextCount);
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
