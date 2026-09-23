import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'projects',
  title: 'Tasks',
  description:
    'A project and task manager for the way you actually work. Capture anything into the Inbox, plan your day in Today, look ahead in Upcoming, and group the rest under projects that carry their own status and progress. Every field edits in place — click a title, priority, due date, label, or project and it saves as you type.',
  icon: 'phosphor:check-circle',
  accent: 'rose',
  author: { name: 'Notis' },
  categories: ['Productivity', 'Personal'],
  tagline: 'Inbox, Today, Upcoming, and projects — every field edited in place.',
  screenshots: [
  {
    "path": "metadata/screenshot-1.png",
    "alt": "Today populated with clearly fictional demonstration data.",
    "route": "today",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-2.png",
    "alt": "Upcoming populated with clearly fictional demonstration data.",
    "route": "upcoming",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-3.png",
    "alt": "Inbox populated with clearly fictional demonstration data.",
    "route": "inbox",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-4.png",
    "alt": "Projects populated with clearly fictional demonstration data.",
    "route": "projects",
    "theme": "light"
  }
],
  databases: [{ slug: 'projects', seedDocuments: true }, { slug: 'tasks', seedDocuments: true }],
  skills: [
    { key: 'tasks-onboarding', path: './skills/tasks-onboarding/', name: 'tasks-onboarding', description: 'Set up Tasks with optional fictional examples.' },
  ],
  onboarding: { skill: 'tasks-onboarding', prompt: 'Help me set up Tasks.' },
  routes: [
    {
      path: '/',
      slug: 'today',
      name: 'Today',
      icon: 'phosphor:calendar-dot',
      default: true,
      resourceDeepLinks: true,
    },
    {
      path: '/upcoming',
      slug: 'upcoming',
      name: 'Upcoming',
      icon: 'phosphor:calendar-blank',
      resourceDeepLinks: true,
    },
    {
      path: '/inbox',
      slug: 'inbox',
      name: 'Inbox',
      icon: 'phosphor:tray',
      resourceDeepLinks: true,
    },
    {
      path: '/projects',
      slug: 'projects',
      name: 'Projects',
      icon: 'phosphor:folders',
      collection: {
        database: 'projects',
        titleProperty: 'Name',
        parentProperty: 'Parent project',
        sidebar: {
          mode: 'tree',
          allowCreate: true,
        },
      },
    },
  ],
  tools: [
    'LOCAL_NOTIS_DATABASE_QUERY',
    'LOCAL_NOTIS_DATABASE_GET_DATABASE',
    'LOCAL_NOTIS_DATABASE_GET_DOCUMENT',
    'LOCAL_NOTIS_DATABASE_UPSERT_TASKS',
    'LOCAL_NOTIS_DATABASE_UPSERT_PROJECTS',
  ],
});
