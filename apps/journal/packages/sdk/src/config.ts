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
 *   icon: 'phosphor:squares-four',
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

export const NOTIS_APP_CATEGORIES = [
  'Productivity',
  'Sales & Marketing',
  'Operations',
  'Product & Engineering',
  'Personal',
] as const;

export type NotisAppCategory = typeof NOTIS_APP_CATEGORIES[number];

export interface NotisAppAuthor {
  name: string;
  handle?: string;
  url?: string;
}

export interface NotisAppSkillConfig {
  key: string;
  path: string;
  name: string;
  description?: string;
}

export interface NotisAppOnboardingConfig {
  skill: string;
  prompt: string;
}

export interface NotisAppScreenshotConfig {
  path: string;
  alt: string;
  route?: string;
  scenario?: string;
}

/**
 * Named accent tokens for an app's avatar. Keep in sync with the portal
 * `ACCENT_NAMES` and the server `ACCENT_TOKENS`.
 */
export const NOTIS_APP_ACCENTS = [
  'blue',
  'violet',
  'emerald',
  'amber',
  'rose',
  'sky',
  'fuchsia',
  'teal',
] as const;

export type NotisAppAccent = typeof NOTIS_APP_ACCENTS[number];

export interface NotisAppConfig {
  /** URL-safe app slug. Existing apps may still use a display name here. */
  name: string;
  /** Human display title, Raycast-style. Falls back to `name`. */
  title?: string;
  description?: string;
  /**
   * App icon. A `phosphor:<name>` value (e.g. `phosphor:dice-five`) or
   * `metadata/icon.png`. When unset, the app shows its two-letter initials.
   */
  icon?: string;
  /**
   * Optional accent color for the app avatar. One of {@link NOTIS_APP_ACCENTS}.
   * When unset, a stable accent is derived automatically from the app id.
   */
  accent?: NotisAppAccent;
  author?: NotisAppAuthor;
  categories?: NotisAppCategory[];
  tagline?: string;
  versionNotes?: string;
  screenshots?: NotisAppScreenshotConfig[];
  databases?: string[];
  routes?: NotisRouteConfig[];
  tools?: string[];
  skills?: NotisAppSkillConfig[];
  onboarding?: NotisAppOnboardingConfig;
}

/**
 * Identity function that provides type checking and autocomplete for the
 * Notis app configuration. The returned object is read at build time by
 * `notis apps build` to generate the manifest.
 */
export function defineNotisApp(config: NotisAppConfig): NotisAppConfig {
  return config;
}
