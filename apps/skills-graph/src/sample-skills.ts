/**
 * A small, realistic skill set used by the dev preview and the listing
 * screenshots. Real accounts never load this — the app reads the signed-in
 * user's own skills through the backend.
 */

import type { SkillDetail } from '@/lib/skill-links';

function skill(name: string, description: string, body: string, index: number): SkillDetail {
  return {
    id: `sample-${name}`,
    name,
    description,
    source: 'custom',
    status: 'active',
    created_at: '2026-05-01T09:00:00.000Z',
    updated_at: `2026-06-${String(10 + index).padStart(2, '0')}T09:00:00.000Z`,
    skill_md: `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
  };
}

export const SAMPLE_SKILLS: SkillDetail[] = [
  skill(
    'weekly-review',
    'Run the Monday weekly review: pull last week’s numbers, decide the three priorities, and write the update.',
    [
      '# Weekly review',
      '',
      '1. Get the numbers first by running `/weekly-metrics`. Do not start the review without them.',
      '2. Draft the update, then hand the wording to the `brand-voice` skill before sending.',
      '3. File anything that needs a reply through `inbox-triage`.',
    ].join('\n'),
    1,
  ),
  skill(
    'weekly-metrics',
    'Collect the weekly numbers from the connected analytics and billing tools into one table.',
    [
      '# Weekly metrics',
      '',
      'Output is consumed directly by `/weekly-review`, so keep the column order stable.',
      'Numbers only — no commentary, no recommendations.',
    ].join('\n'),
    2,
  ),
  skill(
    'brand-voice',
    'Rewrite any outgoing copy so it matches the house voice: short sentences, no hype, no emoji.',
    [
      '# Brand voice',
      '',
      'Apply to every outbound message: updates, launch notes, replies.',
      'When the copy ships an image, the `launch-images` skill owns the visual side.',
    ].join('\n'),
    3,
  ),
  skill(
    'launch-notes',
    'Turn a shipped release into launch notes: what changed, who it is for, and what to do next.',
    [
      '# Launch notes',
      '',
      'Structure: headline, what changed, who it helps, next step.',
      'Run the finished copy through `brand-voice`.',
      'Generate every visual with the `launch-images` skill so the set stays consistent.',
    ].join('\n'),
    4,
  ),
  skill(
    'launch-images',
    'Generate on-brand launch visuals at the right sizes for each channel.',
    [
      '# Launch images',
      '',
      'Sizes: 1200x630 social, 2000x1250 store, 1080x1080 square.',
      'Copy inside an image still follows `brand-voice`.',
    ].join('\n'),
    5,
  ),
  skill(
    'inbox-triage',
    'Sort the inbox into reply now, reply later, and archive, and draft the replies that are obvious.',
    [
      '# Inbox triage',
      '',
      'Three buckets, nothing else. Draft replies, never send them.',
      'Anything that turns into a task goes into the weekly list read by `/weekly-review`.',
    ].join('\n'),
    6,
  ),
  skill(
    'meeting-notes',
    'Capture a meeting into decisions, owners, and follow-ups.',
    ['# Meeting notes', '', 'Decisions first, then owners, then follow-ups with dates.'].join('\n'),
    7,
  ),
  skill(
    'travel-planning',
    'Plan a trip end to end: flights, stays, and a day-by-day outline.',
    ['# Travel planning', '', 'Ask for dates and budget before proposing anything.'].join('\n'),
    8,
  ),
  skill(
    'recipe-capture',
    'Save a recipe from a photo, a link, or a voice note into a clean, repeatable format.',
    ['# Recipe capture', '', 'Ingredients as a list, steps numbered, servings always stated.'].join('\n'),
    9,
  ),
  skill(
    'expense-log',
    'Log a receipt into the expense sheet with amount, category, and project.',
    ['# Expense log', '', 'Amount, currency, category, project. Ask when the category is ambiguous.'].join('\n'),
    10,
  ),
];

export function sampleSummaries() {
  return SAMPLE_SKILLS.map(({ skill_md, ...summary }) => summary);
}

export function sampleSkillById(skillId: string): SkillDetail | undefined {
  return SAMPLE_SKILLS.find((entry) => entry.id === skillId);
}
