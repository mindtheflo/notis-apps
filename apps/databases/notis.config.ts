import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'notis-database',
  title: 'Databases',
  description:
    'A read-only catalog and schema explorer for every database in your Notis workspace. Browse databases grouped by the app that owns them, inspect each property with its type, select options, formats, and formulas, follow relations between databases, and page through the actual records stored in any of them.',
  icon: 'phosphor:database',
  accent: 'sky',
  author: { name: 'Notis' },
  categories: ['Product & Engineering', 'Operations'],
  tagline: 'Explore every database and schema in your Notis workspace.',
  screenshots: [
    {
      path: 'metadata/screenshot-1.png',
      alt: 'Database catalog grouping databases by the app that owns them, with the Accounts schema open on its Properties tab.',
      route: 'catalog',
      scenario: 'catalog-properties',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-2.png',
      alt: 'The same database catalog and Accounts property list in dark mode.',
      route: 'catalog',
      scenario: 'catalog-properties',
      theme: 'dark',
    },
    {
      path: 'metadata/screenshot-3.png',
      alt: 'Documents tab listing account records in a table with their tier, status, ARR, renewal date, and regions.',
      route: 'catalog',
      scenario: 'catalog-documents',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-4.png',
      alt: 'The account records table in dark mode with every property column populated.',
      route: 'catalog',
      scenario: 'catalog-documents',
      theme: 'dark',
    },
    {
      path: 'metadata/screenshot-5.png',
      alt: 'Relations tab showing how the Accounts database links out to Contacts, Deals, and Meeting Notes.',
      route: 'catalog',
      scenario: 'catalog-relations',
      theme: 'light',
    },
  ],
  databases: [{ slug: 'demo_accounts', seedDocuments: true }],
  // Include an isolated fictional starter database and read the whole workspace
  // catalog, which an app runtime is sandboxed away from by default.
  capabilities: { workspaceDatabases: 'read' },
  skills: [
    { key: 'databases-onboarding', path: './skills/databases-onboarding/', name: 'databases-onboarding', description: 'Set up Databases with optional fictional examples.' },
  ],
  onboarding: { skill: 'databases-onboarding', prompt: 'Help me set up Databases.' },
  routes: [
    {
      path: '/',
      slug: 'catalog',
      name: 'Databases',
      icon: 'phosphor:database',
      default: true,
      resourceDeepLinks: true,
    },
  ],
  tools: [
    'LOCAL_NOTIS_DATABASE_LIST_DATABASES',
    'LOCAL_NOTIS_DATABASE_GET_DATABASE',
    'LOCAL_NOTIS_DATABASE_QUERY',
  ],
});
