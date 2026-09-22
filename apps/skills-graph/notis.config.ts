import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'skill-graph',
  title: 'Skills Graph',
  description:
    'Explore how your installed skills connect. Pan and zoom the map, inspect incoming and outgoing references with their supporting lines, or browse every connection in the Links table. Find connected workflows and standalone skills without changing their content.',
  icon: 'phosphor:graph',
  accent: 'violet',
  author: { name: 'Notis' },
  categories: ['Product & Engineering', 'Productivity'],
  tagline: 'A map of how your skills reference each other.',

  screenshots: [
    {
      path: 'metadata/screenshot-1.png',
      alt: 'The skill map showing clusters of skills connected by arrows, with counts for skills, links, chains, and standalone skills.',
      route: 'map',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-2.png',
      alt: 'The same skill map in dark mode with the chains and standalone skills listed beside it.',
      route: 'map',
      theme: 'dark',
    },
    {
      path: 'metadata/screenshot-3.png',
      alt: 'The Links view listing every reference between two skills with the signal that proved it and the line it was found on.',
      route: 'links',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-4.png',
      alt: 'The Links view in dark mode with the most referenced skills and the standalone skills that nothing points at.',
      route: 'links',
      theme: 'dark',
    },
  ],

  // The graph is derived from the skills themselves; nothing is stored.
  databases: [],

  skills: [
    { key: 'skills-graph-onboarding', path: './skills/skills-graph-onboarding/', name: 'skills-graph-onboarding', description: 'Set up Skills Graph with optional fictional examples.' },
  ],
  onboarding: { skill: 'skills-graph-onboarding', prompt: 'Help me set up Skills Graph.' },
  routes: [
    {
      path: '/',
      slug: 'map',
      name: 'Map',
      icon: 'phosphor:graph',
      default: true,
    },
    {
      path: '/links',
      slug: 'links',
      name: 'Links',
      icon: 'phosphor:list-magnifying-glass',
    },
  ],

  tools: ['LOCAL_NOTIS_LIST_SKILLS'],
});
