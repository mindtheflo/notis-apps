import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'product',
  title: 'Product',
  description:
    'Track the work that ships, understand feature adoption, learn from customer conversations, and turn evidence into a prioritized product backlog. Configure your own sources and use the bundled workflows from any connected assistant.',
  icon: 'phosphor:kanban',
  accent: 'violet',
  author: { name: 'Notis' },
  categories: ['Product & Engineering'],
  tagline: 'What shipped, what users adopted, and what they are trying to do.',
  screenshots: [
  {
    "path": "metadata/screenshot-1.png",
    "alt": "Product dashboard populated with clearly fictional demonstration data.",
    "route": "adoption",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-2.png",
    "alt": "Tickets populated with clearly fictional demonstration data.",
    "route": "tickets",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-3.png",
    "alt": "Versions populated with clearly fictional demonstration data.",
    "route": "versions",
    "theme": "light"
  },
  {
    "path": "metadata/screenshot-4.png",
    "alt": "Opportunities populated with clearly fictional demonstration data.",
    "route": "opportunities",
    "theme": "light"
  }
],
  databases: [{ slug: 'tickets', seedDocuments: true }, { slug: 'versions', seedDocuments: true }, { slug: 'product_research_breakdowns', seedDocuments: true }, { slug: 'product_feature_observations', seedDocuments: true }, { slug: 'product_opportunities', seedDocuments: true }, 'product_runs'],
  onboarding: { skill: 'product-onboarding', prompt: 'Help me set up Product.' },
  routes: [
    { path: '/adoption', slug: 'adoption', name: 'Dashboard', icon: 'phosphor:chart-bar', resourceDeepLinks: true, default: true },
    {
      path: '/',
      slug: 'tickets',
      name: 'Tickets',
      icon: 'phosphor:list-checks',
      default: false,
      resourceDeepLinks: true,
    },
    {
      path: '/versions',
      slug: 'versions',
      name: 'Versions',
      icon: 'phosphor:package',
      resourceDeepLinks: true,
    },
    { path: '/opportunities', slug: 'opportunities', name: 'Opportunities', icon: 'phosphor:lightbulb', resourceDeepLinks: true },
  ],
  tools: [
    'LOCAL_NOTIS_DATABASE_QUERY',
    'LOCAL_NOTIS_DATABASE_GET_DATABASE',
    'LOCAL_NOTIS_DATABASE_GET_DOCUMENT',
    'LOCAL_NOTIS_DATABASE_UPSERT_TICKETS',
    'LOCAL_NOTIS_DATABASE_UPSERT_VERSIONS',
    'LOCAL_NOTIS_DATABASE_UPSERT_PRODUCT_OPPORTUNITIES',
  ],
  skills: [
    { key: 'product-onboarding', path: './skills/product-onboarding/', name: 'product-onboarding', description: 'Configure your Product workspace and optional fictional examples.' },
    { key: 'weekly-report', path: './skills/product-weekly-report/', name: 'product-weekly-report', description: 'Review product quality and prepare an evidence-backed weekly update.' },
    { key: 'changelog-release', path: './skills/product-changelog-release/', name: 'product-changelog-release', description: 'Prepare a verified release and its approval-ready launch package.' },
    { key: 'release-social', path: './skills/product-release-social/', name: 'product-release-social', description: 'Draft and deliver explicitly approved release posts.' },
    { key: 'research-conversations', path: './skills/product-research-conversations/', name: 'product-research-conversations', description: 'Analyze selected conversations into private aggregate research.' },
    { key: 'measure-adoption', path: './skills/product-measure-adoption/', name: 'product-measure-adoption', description: 'Measure feature adoption from configured evidence sources.' },
    { key: 'audit-tracking', path: './skills/product-audit-tracking/', name: 'product-audit-tracking', description: 'Identify measurement gaps and propose tracking repairs.' },
    { key: 'prioritize-opportunities', path: './skills/product-prioritize-opportunities/', name: 'product-prioritize-opportunities', description: 'Maintain one evidence-backed opportunity queue.' },
  ],
});
