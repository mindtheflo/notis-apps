import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'notis-random',
  title: 'Random Number Generator',
  description: 'Generate random numbers with configurable bounds, and keep a history of everything you rolled.',
  icon: 'lucide:dices',
  author: { name: 'Notis' },
  categories: ['Personal'],
  tagline: 'Roll dice, keep history.',
  versionNotes: 'Initial scaffold release.',

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
    'notis-default-query',
    'notis-default-upsert_rolls',
  ],
});
