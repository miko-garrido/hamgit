import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "hamgit.columnWidths";

export type ResizableColumn = "folder" | "repo" | "branch";

export type ColumnWidths = {
  folder: number;
  repo: number;
  branch: number;
};

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  folder: 340,
  repo: 160,
  branch: 140,
};

const MIN_WIDTHS: ColumnWidths = {
  folder: 180,
  repo: 120,
  branch: 100,
};

const MAX_WIDTHS: ColumnWidths = {
  folder: 600,
  repo: 400,
  branch: 300,
};

function loadWidths(): ColumnWidths {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_COLUMN_WIDTHS };
    const parsed = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_COLUMN_WIDTHS };
    // Merge with defaults so a partially-populated or stale stored value
    // (e.g. from an older schema) never produces missing/NaN columns.
    return {
      folder: clamp("folder", Number(parsed.folder) || DEFAULT_COLUMN_WIDTHS.folder),
      repo: clamp("repo", Number(parsed.repo) || DEFAULT_COLUMN_WIDTHS.repo),
      branch: clamp("branch", Number(parsed.branch) || DEFAULT_COLUMN_WIDTHS.branch),
    };
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}

function clamp(column: ResizableColumn, value: number): number {
  return Math.min(MAX_WIDTHS[column], Math.max(MIN_WIDTHS[column], value));
}

/**
 * Column widths for Folder/Repo/Branch, persisted to localStorage. Status and
 * Remote are not resizable per DESIGN.md "Column resize". Uses the same
 * lazy-init-before-persist pattern as useRepos: state is seeded from storage
 * before the persist effect can run, so a fresh mount never clobbers a saved
 * value with defaults.
 */
export function useColumnWidths() {
  const [widths, setWidths] = useState<ColumnWidths>(() => loadWidths());

  const widthsKey = useMemo(() => JSON.stringify(widths), [widths]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, widthsKey);
  }, [widthsKey]);

  const setColumnWidth = useCallback((column: ResizableColumn, value: number) => {
    setWidths((current) => ({ ...current, [column]: clamp(column, value) }));
  }, []);

  return { widths, setColumnWidth, minWidths: MIN_WIDTHS, maxWidths: MAX_WIDTHS };
}
