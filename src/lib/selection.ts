export type SelectionModifiers = {
  metaKey: boolean;
  shiftKey: boolean;
};

export function toggleSelection(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function toggleAllSelection(current: ReadonlySet<string>, order: string[]): Set<string> {
  if (order.length === 0) return new Set(current);
  const allSelected = order.every((key) => current.has(key));
  return allSelected ? new Set() : new Set(order);
}

export function extendSelectionRange(
  current: ReadonlySet<string>,
  anchor: string | null,
  target: string,
  order: string[],
): Set<string> {
  if (!anchor) return new Set([target]);

  const anchorIndex = order.indexOf(anchor);
  const targetIndex = order.indexOf(target);
  if (anchorIndex === -1 || targetIndex === -1) {
    return toggleSelection(current, target);
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const next = new Set(current);
  for (const key of order.slice(start, end + 1)) next.add(key);
  return next;
}

/**
 * Context-menu bulk actions follow the macOS table convention: right-clicking
 * any selected row targets the whole selection. An unselected row remains a
 * single-row target so an unrelated selection is never acted on accidentally.
 */
export function contextMenuTargets(folder: string, selected: ReadonlySet<string>): string[] {
  return selected.has(folder) ? Array.from(selected) : [folder];
}
