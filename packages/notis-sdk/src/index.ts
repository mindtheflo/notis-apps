/**
 * @notis/sdk - The Notis App SDK
 *
 * Public API for building Notis apps. Import hooks and the provider from
 * this entrypoint. For configuration, use `@notis/sdk/config`. For the
 * Vite config builder, use `@notis/sdk/vite`.
 */

// Provider
export { NotisProvider, useNotisRuntime } from './provider';

// Hooks
export { useNotis } from './hooks/useNotis';
export { useDatabase } from './hooks/useDatabase';
export { useDocument } from './hooks/useDocument';
export { useUpsertDocument } from './hooks/useUpsertDocument';
export { useTool } from './hooks/useTool';
export { useTools } from './hooks/useTools';
export { useCollectionItems } from './hooks/useCollectionItem';
export { useNotisNavigation } from './hooks/useNotisNavigation';
export { useBackend } from './hooks/useBackend';

// Types (re-exported for convenience)
export type {
  AppDescriptor,
  CollectionItem,
  DatabaseDescriptor,
  DatabaseProperty,
  DocumentRecord,
  NotisRuntime,
  QueryFilter,
  RouteDescriptor,
  ToolDescriptor,
} from './runtime';
