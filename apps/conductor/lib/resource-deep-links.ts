export function findRequestedResource<T>(
  resourceId: string | null,
  values: readonly T[],
  getId: (value: T) => string,
): T | null {
  if (!resourceId) return null;
  return values.find((value) => getId(value) === resourceId) ?? null;
}

export type PendingResourceId = string | null | undefined;

export function beginResourceNavigation(
  hostResourceId: string | null,
  pendingResourceId: PendingResourceId,
  nextResourceId: string | null,
): { pendingResourceId: PendingResourceId; shouldNavigate: boolean } {
  if (pendingResourceId === nextResourceId) {
    return { pendingResourceId, shouldNavigate: false };
  }
  if (pendingResourceId === undefined && hostResourceId === nextResourceId) {
    return { pendingResourceId: undefined, shouldNavigate: false };
  }
  return { pendingResourceId: nextResourceId, shouldNavigate: true };
}
