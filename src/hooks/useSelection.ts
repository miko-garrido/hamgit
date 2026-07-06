import { useCallback, useRef, useState } from "react";

/**
 * Tracks selected row keys (folder paths) plus the anchor used for
 * shift-click range selection. Order-independent visual order is supplied
 * by the caller (the currently sorted row list) so shift-click ranges
 * follow what's on screen.
 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);

  const isSelected = useCallback((key: string) => selected.has(key), [selected]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  /** Checkbox click: plain toggle, and becomes the new anchor. */
  const toggle = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    anchorRef.current = key;
  }, []);

  /**
   * Row click with modifier keys:
   * - metaKey (⌘): toggle this row, becomes new anchor.
   * - shiftKey: extend selection from anchor to this row (inclusive) using
   *   the provided visual order.
   * - plain click: no-op here (rows aren't clickable without a modifier
   *   per DESIGN.md — only the checkbox and modifiers select).
   */
  const handleRowClick = useCallback(
    (key: string, order: string[], event: { metaKey: boolean; shiftKey: boolean }) => {
      if (event.metaKey) {
        toggle(key);
        return;
      }
      if (event.shiftKey && anchorRef.current) {
        const anchor = anchorRef.current;
        const anchorIndex = order.indexOf(anchor);
        const targetIndex = order.indexOf(key);
        if (anchorIndex === -1 || targetIndex === -1) {
          toggle(key);
          return;
        }
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        const range = order.slice(start, end + 1);
        setSelected((current) => {
          const next = new Set(current);
          range.forEach((rangeKey) => next.add(rangeKey));
          return next;
        });
      }
    },
    [toggle],
  );

  return {
    selected,
    isSelected,
    toggle,
    clear,
    handleRowClick,
    setSelected,
  };
}
