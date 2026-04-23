/**
 * Configuration utilities for notis.config.ts.
 *
 * Usage:
 * ```ts
 * // notis.config.ts
 * import { defineNotisApp } from '@notis/sdk/config';
 *
 * export default defineNotisApp({
 *   name: 'My App',
 *   description: 'Does things',
 *   icon: 'lucide:layout-dashboard',
 *   databases: ['tasks'],
 *   routes: [
 *     {
 *       path: '/',
 *       slug: 'notes',
 *       name: 'Notes',
 *       default: true,
 *       collection: {
 *         database: 'notes',
 *         titleProperty: 'Name',
 *         parentProperty: 'Parent',
 *         sidebar: {
 *           mode: 'tree',
 *           allowCreate: true,
 *         },
 *       },
 *     },
 *   ],
 *   tools: [...],
 * });
 * ```
 */

export interface NotisRouteConfig {
  path: string;
  slug: string;
  name: string;
  icon?: string;
  parentSlug?: string | null;
  default?: boolean;
  exportName?: string;
  collection?: {
    database: string;
    titleProperty: string;
    parentProperty?: string | null;
    sidebar?: {
      mode: 'flat-list' | 'tree';
      allowCreate: boolean;
    };
  };
}

export interface NotisAppConfig {
  name: string;
  description?: string;
  icon?: string;
  databases?: string[];
  routes?: NotisRouteConfig[];
  tools?: string[];
}

/**
 * Identity function that provides type checking and autocomplete for the
 * Notis app configuration. The returned object is read at build time by
 * `notis apps build` to generate the manifest.
 */
export function defineNotisApp(config: NotisAppConfig): NotisAppConfig {
  return config;
}
