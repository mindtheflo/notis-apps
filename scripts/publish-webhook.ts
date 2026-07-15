/**
 * Build the publish payload for a single app, upload the bundle to Supabase
 * Storage, and POST an HMAC-signed webhook to the Notis registry endpoint.
 *
 * Designed to run inside the merge-publish workflow on pushes to main. Requires
 * these env vars:
 *   NOTIS_REGISTRY_WEBHOOK_URL    (empty -> dry run: payload is printed, not POSTed)
 *   NOTIS_REGISTRY_WEBHOOK_SECRET (HMAC-SHA256 signing key)
 *   SUPABASE_STORAGE_URL          (https://xxx.supabase.co)
 *   SUPABASE_STORAGE_SERVICE_KEY  (service-role key; write access to the bucket)
 *   SUPABASE_STORAGE_BUCKET       (defaults to "app-code")
 *   COMMIT_SHA                    (the commit that triggered the publish)
 *
 * Usage:
 *   tsx scripts/publish-webhook.ts apps/<slug>
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

function die(msg: string): never {
  console.error(`publish-webhook: ${msg}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) die(`Missing required env var ${name}`);
  return value;
}

function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJsonStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>).sort();
  return `{${entries
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function sha256(data: Buffer | string): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

function collectBundleFiles(distDir: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  }
  walk(distDir);
  return out;
}

async function uploadBundle(
  files: string[],
  distDir: string,
  storageUrl: string,
  serviceKey: string,
  bucket: string,
  registrySlug: string,
  version: string,
): Promise<{ bundleUrl: string; cssUrl?: string }> {
  const basePrefix = `registry/${registrySlug}/v${version}`;
  let primaryObjectUrl: string | null = null;
  let cssUrl: string | undefined;

  for (const file of files) {
    const relPath = relative(distDir, file).split('\\').join('/');
    const target = `${basePrefix}/${relPath}`;
    const body = readFileSync(file);
    const url = `${storageUrl}/storage/v1/object/${bucket}/${target}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        'x-upsert': 'true',
        'content-type': 'application/octet-stream',
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      die(`Failed to upload ${relPath}: ${response.status} ${text}`);
    }
    if (relPath === 'bundle.js' || (!primaryObjectUrl && relPath.endsWith('.js'))) {
      primaryObjectUrl = `${storageUrl}/storage/v1/object/public/${bucket}/${target}`;
    }
    if (relPath === 'app.css' || (!cssUrl && relPath.endsWith('.css'))) {
      cssUrl = `${storageUrl}/storage/v1/object/public/${bucket}/${target}`;
    }
  }

  if (!primaryObjectUrl) die('No .js bundle file found in dist/');
  return { bundleUrl: primaryObjectUrl, cssUrl };
}

const appPath = process.argv[2];
if (!appPath) die('Usage: tsx scripts/publish-webhook.ts apps/<slug>');

const absolute = resolve(process.cwd(), appPath);
const configPath = join(absolute, 'notis.config.ts');
const packageJsonPath = join(absolute, 'package.json');
const listingJsonPath = join(absolute, 'notis-listing.json');
const distDir = join(absolute, 'dist');

if (!existsSync(configPath)) die(`notis.config.ts not found at ${configPath}`);
if (!existsSync(packageJsonPath)) die(`package.json not found at ${packageJsonPath}`);
if (!existsSync(listingJsonPath)) die(`notis-listing.json not found at ${listingJsonPath}`);
if (!existsSync(distDir)) die(`dist/ not found; run the build step first`);

const packageJson = (await import(pathToFileURL(packageJsonPath).href, {
  with: { type: 'json' },
})).default as { name?: string; notisAppVersion?: string };
if (!packageJson.notisAppVersion) die('package.json is missing notisAppVersion');

const manifestModule = await import(pathToFileURL(configPath).href);
const sourceManifest = manifestModule.default as Record<string, unknown>;
const listing = JSON.parse(readFileSync(listingJsonPath, 'utf8')) as Record<string, unknown>;
const sourceApp = sourceManifest.app && typeof sourceManifest.app === 'object'
  ? sourceManifest.app as Record<string, unknown>
  : {};
const author = listing.author ?? sourceApp.author ?? sourceManifest.author;
const manifest = {
  ...sourceManifest,
  app: {
    ...sourceApp,
    name: sourceApp.name ?? sourceManifest.name ?? listing.name,
    title: sourceApp.title ?? listing.name ?? sourceManifest.name,
    description: sourceApp.description ?? listing.description ?? sourceManifest.description,
    tagline: sourceApp.tagline ?? listing.tagline ?? sourceManifest.tagline,
    categories: sourceApp.categories ?? listing.categories ?? sourceManifest.categories,
    version_notes: sourceApp.version_notes ?? listing.version_notes ?? sourceManifest.version_notes,
    author,
  },
};
const canonical = canonicalJsonStringify(manifest);
const manifestHash = `sha256:${sha256(canonical)}`;

const registrySlug = appPath.replace(/^apps\//, '').replace(/\/+$/, '');
const bundleFiles = collectBundleFiles(distDir);
const bundleContentHash = sha256(Buffer.concat(bundleFiles.sort().map((f) => readFileSync(f))));

const webhookUrl = process.env.NOTIS_REGISTRY_WEBHOOK_URL?.trim() ?? '';
const webhookSecret = process.env.NOTIS_REGISTRY_WEBHOOK_SECRET?.trim() ?? '';

let bundleUrl: string;
let cssUrl: string | undefined;
if (webhookUrl) {
  const storageUrl = requireEnv('SUPABASE_STORAGE_URL');
  const serviceKey = requireEnv('SUPABASE_STORAGE_SERVICE_KEY');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'app-code';
  ({ bundleUrl, cssUrl } = await uploadBundle(
    bundleFiles,
    distDir,
    storageUrl,
    serviceKey,
    bucket,
    registrySlug,
    packageJson.notisAppVersion,
  ));
} else {
  bundleUrl = `dry-run://registry/${registrySlug}/v${packageJson.notisAppVersion}/bundle.js`;
  cssUrl = bundleFiles.some((file) => file.endsWith('.css'))
    ? `dry-run://registry/${registrySlug}/v${packageJson.notisAppVersion}/app.css`
    : undefined;
}

const commitSha = process.env.COMMIT_SHA?.trim() || 'main';
const repository = process.env.GITHUB_REPOSITORY?.trim() || 'mindtheflo/notis-apps';
const screenshots = Array.isArray(listing.screenshots)
  ? listing.screenshots.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const screenshot = entry as Record<string, unknown>;
      const screenshotPath = typeof screenshot.path === 'string' ? screenshot.path : '';
      return {
        ...screenshot,
        public_url: screenshot.public_url || (
          screenshotPath
            ? `https://raw.githubusercontent.com/${repository}/${commitSha}/apps/${registrySlug}/${screenshotPath}`
            : undefined
        ),
      };
    })
  : [];

const payload = {
  registry_slug: registrySlug,
  version: packageJson.notisAppVersion,
  manifest,
  manifest_hash: manifestHash,
  bundle_url: bundleUrl,
  css_url: cssUrl,
  bundle_sha256: `sha256:${bundleContentHash}`,
  commit_sha: commitSha,
  name: listing.name,
  description: listing.description,
  tagline: listing.tagline,
  categories: listing.categories,
  category: listing.category,
  version_notes: listing.version_notes,
  author,
  screenshots,
  submitted_by_notis_user_id: listing.submitted_by_notis_user_id,
  source_app_id: listing.source_app_id,
  source_version: listing.source_version,
  published_at: new Date().toISOString(),
  published_by: listing.submitted_by_notis_user_id ?? 'ci',
  timestamp: Math.floor(Date.now() / 1000),
  nonce: randomUUID(),
};

const body = JSON.stringify(payload);

if (!webhookUrl) {
  console.log('publish-webhook: DRY RUN (NOTIS_REGISTRY_WEBHOOK_URL not set)');
  console.log(body);
  process.exit(0);
}

if (!webhookSecret) die('Missing NOTIS_REGISTRY_WEBHOOK_SECRET');
const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');

const response = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-notis-signature': `sha256=${signature}`,
    'x-notis-timestamp': String(payload.timestamp),
    'x-notis-nonce': payload.nonce,
  },
  body,
});

const responseText = await response.text().catch(() => '');
if (!response.ok) {
  die(`Webhook failed: ${response.status} ${responseText}`);
}
console.log(`publish-webhook: ${registrySlug}@${packageJson.notisAppVersion} -> ${webhookUrl}: ${response.status}`);
