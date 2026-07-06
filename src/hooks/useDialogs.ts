import { useCallback, useState } from "react";
import type { DialogSpec } from "../components/Dialog";

/**
 * Minimal single-dialog controller: showing a new dialog replaces whatever
 * is currently visible (per DESIGN.md, only one dialog at a time).
 */
export function useDialogs() {
  const [dialog, setDialog] = useState<DialogSpec | null>(null);

  const show = useCallback((spec: DialogSpec) => {
    setDialog(spec);
  }, []);

  const dismiss = useCallback(() => {
    setDialog(null);
  }, []);

  return { dialog, show, dismiss };
}
