'use client';

import { useNotisRuntime } from '../provider';
import type { AppDescriptor, RouteDescriptor, DatabaseDescriptor } from '../runtime';

interface NotisContext {
  /** App metadata (id, name, icon, description). Null before runtime loads. */
  app: AppDescriptor | null;
  /** Current route descriptor. Null before runtime loads. */
  route: RouteDescriptor | null;
  /** Databases declared by this app. Empty before runtime loads. */
  databases: DatabaseDescriptor[];
  /** Whether the runtime is loaded and available. */
  ready: boolean;
}

/**
 * Access app-level metadata: the app descriptor, current route, and declared
 * databases. Returns safe defaults when the runtime isn't available (SSR or
 * during `next dev` without preview).
 */
export function useNotis(): NotisContext {
  const runtime = useNotisRuntime();

  return {
    app: runtime?.app ?? null,
    route: runtime?.route ?? null,
    databases: runtime?.databases ?? [],
    ready: runtime !== null,
  };
}
