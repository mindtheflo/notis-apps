/**
 * Regenerates metadata/screenshot-fixtures.json from the sample skills so the
 * listing screenshots render the same graph as the dev preview.
 *
 * Run with `npm run fixtures`.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SAMPLE_SKILLS } from '../src/sample-skills';

const here = dirname(fileURLToPath(import.meta.url));

const tools: Record<string, unknown> = {
  LOCAL_NOTIS_LIST_SKILLS: {
    status: 'success',
    installed_skills: SAMPLE_SKILLS,
    curated_catalog: [],
  },
};
const fixtures = { tools, requests: {} };
const target = join(here, '..', 'metadata', 'screenshot-fixtures.json');
writeFileSync(target, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`Wrote ${Object.keys(tools).length} tool fixture to ${target}`);
