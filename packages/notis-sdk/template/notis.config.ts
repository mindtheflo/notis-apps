import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'My Notis App',
  description: 'A new Notis app',
  icon: 'lucide:layout-dashboard',

  databases: ['items'],

  routes: [
    { path: '/', slug: 'home', name: 'Home', icon: 'lucide:home', default: true },
    // Example collection tree route:
    // {
    //   path: '/notes',
    //   slug: 'notes',
    //   name: 'Notes',
    //   collection: {
    //     database: 'notes',
    //     titleProperty: 'Name',
    //     parentProperty: 'Parent',
    //     sidebar: {
    //       mode: 'tree',
    //       allowCreate: true,
    //     },
    //   },
    // },
  ],

  tools: [
    'notis_query_database',
    'notis_upsert_document',
  ],
});
