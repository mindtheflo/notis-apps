import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'Notis Notes',
  description: 'Browse notes by documents, table, or calendar with folders in the sidebar.',
  icon: 'lucide:notebook-pen',
  databases: ['note_folders', 'notes'],
  routes: [
    {
      path: '/',
      slug: 'notes',
      name: 'Notes',
      icon: 'lucide:notebook-pen',
      default: true,
      collection: {
        database: 'note_folders',
        titleProperty: 'Name',
        parentProperty: 'Parent',
        sidebar: {
          mode: 'tree',
          allowCreate: true,
        },
      },
    },
  ],
  tools: [
    'notis_query_database',
    'notis_get_document',
    'notis_upsert_document',
  ],
});
