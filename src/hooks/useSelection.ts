import { useCallback, useRef, useState } from "react";
import {
  extendSelectionRange,
  toggleAllSelection,
  toggleSelection,
  type SelectionModifiers,
} from "../lib/selection";

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
    setSelected((current) => toggleSelection(current, key));
    anchorRef.current = key;
  }, []);

  const toggleAll = useCallback((order: string[]) => {
    setSelected((current) => toggleAllSelection(current, order));
    anchorRef.current = null;
  }, []);

  /**
   * Selection click with modifier keys:
   * - shiftKey: extend selection from anchor to this row (inclusive) using
   *   the provided visual order.
   * - metaKey (⌘): toggle this row, becomes new anchor.
   * - a plain checkbox click toggles; a plain row click is a no-op.
   */
  const handleSelectionClick = useCallback(
    (key: string, order: string[], event: SelectionModifiers, source: "row" | "checkbox") => {
      if (event.shiftKey) {
        setSelected((current) => extendSelectionRange(current, anchorRef.current, key, order));
        if (!anchorRef.current || !order.includes(anchorRef.current)) anchorRef.current = key;
        return;
      }

      if (event.metaKey || source === "checkbox") {
        toggle(key);
      }
    },
    [toggle],
  );

  return {
    selected,
    isSelected,
    toggle,
    toggleAll,
    clear,
    handleSelectionClick,
    setSelected,
  };
}
