import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'meeting-minutes',
  title: 'Meeting Minutes',
  description:
    'Meeting records from your chosen recorder or a manual import, kept as a readable archive. Browse meetings newest-first with their attendees, length, recording and full write-up, and read the summary, analysis and transcript side by side with the list. Action items land in their own database, linked back to the meeting they came from, so the commitments made in a call can be filtered by assignee and status without reopening the notes.',
  icon: 'phosphor:calendar-dots',
  accent: 'teal',
  author: { name: 'Notis' },
  categories: ['Productivity', 'Operations'],
  tagline: 'Read every meeting, and the promises made in it.',

  screenshots: [
  {
    "path": "metadata/screenshot-1.png",
    "alt": "Meeting reader populated with clearly fictional demonstration data.",
    "route": "meetings",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-2.png",
    "alt": "Action items populated with clearly fictional demonstration data.",
    "route": "action-items",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-3.png",
    "alt": "Meeting reader populated with clearly fictional demonstration data. Dark theme.",
    "route": "meetings",
    "theme": "dark"
  }
],
  databases: [{ slug: 'meetings', seedDocuments: true }, { slug: 'meeting_action_items', seedDocuments: true }],

  skills: [
    { key: 'meeting-preparation', path: './skills/meeting-preparation/', name: 'meeting-preparation', description: 'Prepare a meeting from the installer calendars and prior records.' },
    { key: 'meeting-social-draft', path: './skills/meeting-social-draft/', name: 'meeting-social-draft', description: 'Meeting social draft for the current installer.' },
    { key: 'meeting-task-sync', path: './skills/meeting-task-sync/', name: 'meeting-task-sync', description: 'Meeting task sync for the current installer.' },
    { key: 'meeting-action-items', path: './skills/meeting-action-items/', name: 'meeting-action-items', description: 'Meeting action items for the current installer.' },
    { key: 'meeting-record-capture', path: './skills/meeting-record-capture/', name: 'meeting-record-capture', description: 'Meeting record capture for the current installer.' },
    { key: 'meeting-minutes-onboarding', path: './skills/meeting-minutes-onboarding/', name: 'meeting-minutes-onboarding', description: 'Set up Meeting Minutes with optional fictional examples.' },
  ],
  onboarding: { skill: 'meeting-minutes-onboarding', prompt: 'Help me set up Meeting Minutes.' },
  routes: [
    {
      path: '/',
      slug: 'meetings',
      name: 'Meetings',
      icon: 'phosphor:calendar-dots',
      default: true,
      resourceDeepLinks: true,
    },
    {
      path: '/action-items',
      slug: 'action-items',
      name: 'Action Items',
      icon: 'phosphor:check-square-offset',
      resourceDeepLinks: true,
    },
  ],

  tools: [
    'LOCAL_NOTIS_DATABASE_QUERY',
    'LOCAL_NOTIS_DATABASE_GET_DOCUMENT',
    // The SDK derives the slug-only alias client-side, so that is the form the
    // bundle actually sends; the id-suffixed name is declared alongside it so
    // authorization still resolves if the alias ever becomes ambiguous.
    'LOCAL_NOTIS_DATABASE_UPSERT_MEETING_ACTION_ITEMS',
  ],
});
