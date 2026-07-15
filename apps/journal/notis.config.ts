import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'notis-journal',
  title: 'Journal',
  description:
    'A calm, structured daily journal that pairs your reflections with wellbeing and medication tracking — morning and overall mood, motivation, sleepiness, meaningful tasks, appetite, and how long your medication kept you switched on. Entries are captured by telling Notis about your day; the app is your place to browse and refine them.',
  icon: 'phosphor:notebook',
  author: { name: 'Notis' },
  categories: ['Personal', 'Productivity'],
  tagline: 'Browse and refine the days you journal with Notis.',
  versionNotes:
    'Production publication fix: Journal now ships with durable public bundle, CSS, and screenshot assets while preserving its browse-first journal experience.',
  screenshots: [
    {
      path: 'metadata/screenshot-1.png',
      alt: 'Journal timeline with five populated daily entries and a selected reflection.',
      route: 'journal',
      scenario: 'journal-overview',
    },
    {
      path: 'metadata/screenshot-2.png',
      alt: 'Journal entry editor showing mood, energy, tasks, medication, and reflection fields.',
      route: 'journal',
      scenario: 'journal-entry-editor',
    },
    {
      path: 'metadata/screenshot-3.png',
      alt: 'Journal insights dashboard with populated wellbeing and medication trends.',
      route: 'insights',
      scenario: 'journal-insights',
    },
  ],
  databases: ['journal_entries'],
  skills: [
    {
      key: 'journal-onboarding',
      path: './skills/journal-onboarding/SKILL.md',
      name: 'journal-onboarding',
      description:
        'Set up the Journal daily check-in routine and run its evening completeness check.',
    },
  ],
  onboarding: {
    skill: 'journal-onboarding',
    prompt: 'Help me set up my Journal reminders.',
  },
  routes: [
    {
      path: '/',
      slug: 'journal',
      name: 'Journal',
      icon: 'phosphor:notebook',
      default: true,
    },
    {
      path: '/insights',
      slug: 'insights',
      name: 'Insights',
      icon: 'phosphor:chart-line-up',
    },
  ],
  tools: [
    'LOCAL_NOTIS_DATABASE_QUERY',
    'LOCAL_NOTIS_DATABASE_GET_DATABASE',
    'LOCAL_NOTIS_DATABASE_GET_DOCUMENT',
    'LOCAL_NOTIS_DATABASE_UPSERT_JOURNAL_ENTRIES',
  ],
});
