import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, pickDirectories } from "../lib/invoke";
import { folderName } from "../lib/format";
import type { ActionResult, RepoRow, RepositoryState, SortColumn, SortDirection } from "../types";

const STORAGE_KEY = "hamgit.repositories";
const REFRESH_CONCURRENCY = 6;
const ACTION_CONCURRENCY = 3;
const AUTO_REFRESH_MS = 30_000;

function loadFolders(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function pendingRow(folder: string): RepoRow {
  return {
    folder,
    repo: folderName(folder),
    branch: null,
    status: "Error",
    remote: "unknown",
    isDirty: false,
    hasConflicts: false,
    isDetached: false,
    error: null,
    selected: false,
    refreshing: false,
    acting: false,
    note: "Pending refresh",
  };
}

async function runLimited<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const next = index;
      index += 1;
      await worker(items[next], next);
    }
  });
  await Promise.all(workers);
}

export function useRepos() {
  const [rows, setRows] = useState<RepoRow[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>("repo");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const refreshInFlight = useRef(false);

  useEffect(() => {
    const folders = loadFolders();
    setRows(folders.map(pendingRow));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.map((row) => row.folder)));
  }, [rows]);

  const updateRow = useCallback((folder: string, patch: Partial<RepoRow>) => {
    setRows((current) =>
      current.map((row) => (row.folder === folder ? { ...row, ...patch } : row)),
    );
  }, []);

  const refreshFolders = useCallback(async (folders: string[]) => {
    if (folders.length === 0) return;
    folders.forEach((folder) => updateRow(folder, { refreshing: true }));

    await runLimited(folders, REFRESH_CONCURRENCY, async (folder) => {
      try {
        const state = await invoke<RepositoryState>("inspect_repository", { folder });
        setRows((current) =>
          current.map((row) =>
            row.folder === folder
              ? { ...row, ...state, refreshing: false, note: state.error }
              : row,
          ),
        );
      } catch (error) {
        updateRow(folder, {
          refreshing: false,
          status: "Error",
          remote: "unknown",
          error: String(error),
          note: String(error),
        });
      }
    });
  }, [updateRow]);

  // Initial load: refresh once the repo list first populates.
  const initialRefreshDone = useRef(false);
  useEffect(() => {
    if (rows.length > 0 && !initialRefreshDone.current) {
      initialRefreshDone.current = true;
      void refreshFolders(rows.map((row) => row.folder));
    }
  }, [rows, refreshFolders]);

  // Hardcoded 30s auto-refresh; skips rows with actions in flight.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (refreshInFlight.current) return;
      setRows((current) => {
        const eligible = current.filter((row) => !row.acting && !row.refreshing);
        if (eligible.length > 0) {
          refreshInFlight.current = true;
          void refreshFolders(eligible.map((row) => row.folder)).finally(() => {
            refreshInFlight.current = false;
          });
        }
        return current;
      });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshFolders]);

  const addRepositories = useCallback(async () => {
    const folders = await pickDirectories();
    let newFolders: string[] = [];
    setRows((current) => {
      newFolders = folders.filter((folder) => !current.some((row) => row.folder === folder));
      if (newFolders.length === 0) return current;
      return [...current, ...newFolders.map(pendingRow)];
    });
    if (newFolders.length > 0) {
      await refreshFolders(newFolders);
    }
  }, [refreshFolders]);

  const removeFolders = useCallback((folders: string[]) => {
    const set = new Set(folders);
    setRows((current) => current.filter((row) => !set.has(row.folder)));
  }, []);

  const pullRows = useCallback(async (targetRows: RepoRow[]) => {
    const allowed = targetRows.filter(
      (row) => !row.isDirty && !row.hasConflicts && !row.isDetached && row.status !== "Error",
    );
    await runLimited(allowed, ACTION_CONCURRENCY, async (row) => {
      updateRow(row.folder, { acting: true, note: "Pulling…" });
      const result = await invoke<ActionResult>("pull_repository", { folder: row.folder });
      updateRow(row.folder, { acting: false, note: result.message });
      await refreshFolders([row.folder]);
    });
    return { skipped: targetRows.length - allowed.length };
  }, [updateRow, refreshFolders]);

  const switchRows = useCallback(async (targetRows: RepoRow[], branch: string, allowDetached = false) => {
    const allowed = targetRows.filter(
      (row) =>
        !row.isDirty &&
        !row.hasConflicts &&
        (allowDetached || !row.isDetached) &&
        row.status !== "Error",
    );
    await runLimited(allowed, ACTION_CONCURRENCY, async (row) => {
      updateRow(row.folder, { acting: true, note: `Switching to ${branch}…` });
      const result = await invoke<ActionResult>("switch_repository", {
        folder: row.folder,
        branch,
      });
      updateRow(row.folder, { acting: false, note: result.message });
      await refreshFolders([row.folder]);
    });
    return { skipped: targetRows.length - allowed.length };
  }, [updateRow, refreshFolders]);

  const openInVSCode = useCallback(async (folder: string) => {
    const result = await invoke<ActionResult>("open_in_vscode", { folder });
    updateRow(folder, { note: result.message });
    return result;
  }, [updateRow]);

  const revealInFinder = useCallback(async (folder: string) => {
    const result = await invoke<ActionResult>("reveal_in_finder", { folder });
    updateRow(folder, { note: result.message });
    return result;
  }, [updateRow]);

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const aValue = (sortColumn === "branch" ? a.branch ?? "" : a[sortColumn]) ?? "";
      const bValue = (sortColumn === "branch" ? b.branch ?? "" : b[sortColumn]) ?? "";
      const cmp = String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base" });
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortColumn, sortDirection]);

  return {
    rows: sortedRows,
    rawRows: rows,
    setRows,
    updateRow,
    refreshFolders,
    addRepositories,
    removeFolders,
    pullRows,
    switchRows,
    openInVSCode,
    revealInFinder,
    sortColumn,
    sortDirection,
    toggleSort,
  };
}
