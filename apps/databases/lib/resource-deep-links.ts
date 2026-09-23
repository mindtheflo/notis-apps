export function findDatabaseResource<T extends { id: string }>(
  resourceId: string | null,
  rows: readonly T[],
): T | null {
  if (!resourceId) return null;
  return rows.find((row) => row.id === resourceId) ?? null;
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
