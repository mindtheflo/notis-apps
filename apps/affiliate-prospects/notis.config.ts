import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'affiliate-prospects',
  title: 'Affiliate Prospects',
  description:
    'A campaign control center for sourcing, qualifying, contacting, and activating high-fit Notis affiliates.',
  icon: 'phosphor:users-three',
  accent: 'violet',
  author: { name: 'Florian (Flo) Pariset' },
  categories: ['Sales & Marketing', 'Operations'],
  tagline: 'Turn affiliate recruiting into a measurable, repeatable pipeline.',
  screenshots: [
    {
      path: 'metadata/screenshot-1.png',
      alt: 'Affiliate campaign dashboard with pipeline, priority queue, and segment performance.',
      route: 'dashboard',
      scenario: 'affiliate-dashboard',
      focus: '[data-store-screenshot="dashboard"]',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-2.png',
      alt: 'Affiliate prospect list with status, segment, fit score, source, and next action.',
      route: 'prospects',
      scenario: 'affiliate-prospects',
      focus: '[data-store-screenshot="prospects"]',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-3.png',
      alt: 'Affiliate segment scorecards showing campaign progress and sourcing playbooks.',
      route: 'segments',
      scenario: 'affiliate-segments',
      focus: '[data-store-screenshot="segments"]',
      theme: 'dark',
    },
  ],

  databases: ['affiliate_prospects_1'],

  routes: [
    {
      path: '/',
      slug: 'dashboard',
      name: 'Dashboard',
      icon: 'phosphor:squares-four',
      default: true,
    },
    {
      path: '/prospects',
      slug: 'prospects',
      name: 'Prospects',
      icon: 'phosphor:users',
    },
    {
      path: '/segments',
      slug: 'segments',
      name: 'Segments',
      icon: 'phosphor:circles-three-plus',
    },
  ],

  tools: ['LOCAL_NOTIS_DATABASE_QUERY'],
});
