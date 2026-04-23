import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'Random Number Generator',
  description: 'Generate random numbers with configurable bounds, and keep a history of everything you rolled.',
  icon: 'lucide:dices',

  databases: ['rolls'],

  routes: [
    {
      path: '/',
      slug: 'home',
      name: 'Generator',
      icon: 'lucide:sparkles',
      default: true,
    },
    {
      path: '/history',
      slug: 'history',
      name: 'History',
      icon: 'lucide:history',
      collection: {
        database: 'rolls',
        titleProperty: 'Value',
        sidebar: {
          mode: 'flat-list',
          allowCreate: false,
        },
      },
    },
  ],

  tools: [
    'notis_query_database',
    'notis_upsert_document',
  ],
});
