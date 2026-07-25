import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { afterPaint } from "../lib/afterPaint";
import { invoke, pickDirectories } from "../lib/invoke";
import { folderName } from "../lib/format";
import type {
  ActionResult,
  BulkActionResult,
  RepoRow,
  RepositoryState,
  SortColumn,
  SortDirection,
} from "../types";

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
    loaded: false,
    refreshing: false,
    acting: false,
    actingVerb: null,
    note: null,
  };
}

/** Bulk pull/push/sync eligibility per DESIGN.md: skip dirty/conflict/detached/error repos. */
function isEligible(row: RepoRow): boolean {
  return !row.isDirty && !row.hasConflicts && !row.isDetached && row.status !== "Error";
}

function skipReason(row: RepoRow): string {
  if (row.hasConflicts) return "unresolved merge conflicts";
  if (row.isDirty) return "uncommitted changes";
  if (row.isDetached) return "detached HEAD";
  if (row.status === "Error") return row.error ?? "repository error";
  return "not eligible";
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

type LoadOptions = {
  /** When false, skip marking rows refreshing / afterPaint (continuation pass). */
  paint?: boolean;
  /** When false, leave refreshing true after each row finishes (multi-pass load). */
  clearRefreshing?: boolean;
};

export function useRepos() {
  // Lazy init: rows must be seeded from storage before the persist effect can
  // ever run, otherwise a mount with empty state wipes the saved repo list.
  const [rows, setRows] = useState<RepoRow[]>(() => loadFolders().map(pendingRow));
  const [sortColumn, setSortColumn] = useState<SortColumn>("repo");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const refreshInFlight = useRef(false);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const folders = useMemo(() => rows.map((row) => row.folder), [rows]);
  const foldersKey = useMemo(() => JSON.stringify(folders), [folders]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, foldersKey);
  }, [foldersKey]);

  const updateRow = useCallback((folder: string, patch: Partial<RepoRow>) => {
    setRows((current) =>
      current.map((row) => (row.folder === folder ? { ...row, ...patch } : row)),
    );
  }, []);

  const loadFoldersState = useCallback(
    async (
      folders: string[],
      command: "refresh_repository" | "inspect_repository",
      options: LoadOptions = {},
    ) => {
      if (folders.length === 0) return;
      const { paint = true, clearRefreshing = true } = options;

      if (paint) {
        folders.forEach((folder) => updateRow(folder, { refreshing: true }));
        await afterPaint();
      }

      await runLimited(folders, REFRESH_CONCURRENCY, async (folder) => {
        try {
          const state = await invoke<RepositoryState>(command, { folder });
          setRows((current) =>
            current.map((row) =>
              row.folder === folder
                ? {
                    ...row,
                    ...state,
                    loaded: true,
                    refreshing: clearRefreshing ? false : true,
                    // Keep the in-flight label (e.g. "Switching to…") while acting;
                    // otherwise surface the inspect error as a row note.
                    note: row.acting ? row.note : state.error,
                  }
                : row,
            ),
          );
        } catch (error) {
          updateRow(folder, {
            loaded: true,
            refreshing: clearRefreshing ? false : true,
            status: "Error",
            remote: "unknown",
            error: String(error),
            note: String(error),
          });
        }
      });
    },
    [updateRow],
  );

  /** Manual / timed refresh: best-effort fetch then inspect. */
  const refreshFolders = useCallback(
    async (folders: string[]) => loadFoldersState(folders, "refresh_repository"),
    [loadFoldersState],
  );

  /** Post-action refresh: local inspect only (refs already updated by the action). */
  const inspectFolders = useCallback(
    async (folders: string[]) => loadFoldersState(folders, "inspect_repository"),
    [loadFoldersState],
  );

  // Initial load: local inspect then background fetch, one continuous spinner.
  const initialRefreshDone = useRef(false);
  useEffect(() => {
    if (rows.length > 0 && !initialRefreshDone.current) {
      initialRefreshDone.current = true;
      const folders = rows.map((row) => row.folder);
      void (async () => {
        await loadFoldersState(folders, "inspect_repository", { clearRefreshing: false });
        await loadFoldersState(folders, "refresh_repository", {
          paint: false,
          clearRefreshing: true,
        });
      })();
    }
  }, [rows, loadFoldersState]);

  // Hardcoded 30s auto-refresh; skips rows with actions in flight.
  // Side effects stay outside setState updaters (StrictMode-safe).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (refreshInFlight.current) return;
      const eligible = rowsRef.current.filter((row) => !row.acting && !row.refreshing);
      if (eligible.length === 0) return;
      refreshInFlight.current = true;
      void refreshFolders(eligible.map((row) => row.folder)).finally(() => {
        refreshInFlight.current = false;
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

  const bulkAction = useCallback(
    async (
      targetRows: RepoRow[],
      verb: "pull" | "push" | "sync",
      run: (row: RepoRow) => Promise<void>,
    ): Promise<BulkActionResult> => {
      const allowed = targetRows.filter(isEligible);
      const skipped = targetRows
        .filter((row) => !isEligible(row))
        .map((row) => ({ folder: row.folder, repo: row.repo, reason: skipReason(row) }));
      const succeeded: string[] = [];
      const failed: { folder: string; repo: string; message: string }[] = [];

      // Guard all selected rows immediately (acting:true, no verb yet) so a
      // second pull/push/switch can't start on a queued repo. Verb/label is
      // set when the worker actually begins that row.
      for (const row of allowed) {
        updateRow(row.folder, { acting: true, actingVerb: null });
      }
      await afterPaint();

      await runLimited(allowed, ACTION_CONCURRENCY, async (row) => {
        updateRow(row.folder, { actingVerb: verb });
        await afterPaint();
        // Keep acting true through the post-action inspect so the remote cell
        // shows "Pulling…" / "Pushing…" / "Syncing…" until refresh lands
        // (DESIGN.md + Paper "Remote updating").
        try {
          await run(row);
          succeeded.push(row.folder);
        } catch (error) {
          failed.push({ folder: row.folder, repo: row.repo, message: String(error) });
        } finally {
          await inspectFolders([row.folder]);
          updateRow(row.folder, { acting: false, actingVerb: null });
        }
      });

      return { succeeded, failed, skipped };
    },
    [updateRow, inspectFolders],
  );

  const pullRows = useCallback(
    (targetRows: RepoRow[]) =>
      bulkAction(targetRows, "pull", async (row) => {
        const result = await invoke<ActionResult>("pull_repository", { folder: row.folder });
        updateRow(row.folder, { note: result.message });
        if (!result.ok) throw new Error(result.message);
      }),
    [bulkAction, updateRow],
  );

  const pushRows = useCallback(
    (targetRows: RepoRow[]) =>
      bulkAction(targetRows, "push", async (row) => {
        const result = await invoke<ActionResult>("push_repository", { folder: row.folder });
        updateRow(row.folder, { note: result.message });
        if (!result.ok) throw new Error(result.message);
      }),
    [bulkAction, updateRow],
  );

  /** Sync = pull (ff-only) then push; a pull failure aborts the push for that repo. */
  const syncRows = useCallback(
    (targetRows: RepoRow[]) =>
      bulkAction(targetRows, "sync", async (row) => {
        const pullResult = await invoke<ActionResult>("pull_repository", { folder: row.folder });
        if (!pullResult.ok) {
          updateRow(row.folder, { note: pullResult.message });
          throw new Error(pullResult.message);
        }
        const pushResult = await invoke<ActionResult>("push_repository", { folder: row.folder });
        updateRow(row.folder, { note: pushResult.message });
        if (!pushResult.ok) throw new Error(pushResult.message);
      }),
    [bulkAction, updateRow],
  );

  /**
   * Single-repo branch switch (Principle 3: no bulk branch change). Callers
   * are responsible for the dirty-repo warning dialog before calling this;
   * conflicted repos are blocked by the caller with a "Can't switch" message.
   */
  const switchBranch = useCallback(
    async (folder: string, branch: string): Promise<ActionResult> => {
      // Branch cell stays on "Switching to…" until the post-action refresh
      // lands (Paper "Branch selected — row shows switching state").
      updateRow(folder, { acting: true, actingVerb: "switch", note: `Switching to ${branch}…` });
      await afterPaint();
      try {
        const result = await invoke<ActionResult>("switch_repository", { folder, branch });
        await inspectFolders([folder]);
        updateRow(folder, { acting: false, actingVerb: null, note: result.message });
        return result;
      } catch (error) {
        const message = String(error);
        updateRow(folder, { acting: false, actingVerb: null, note: message });
        return { ok: false, message };
      }
    },
    [updateRow, inspectFolders],
  );

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
    pushRows,
    syncRows,
    switchBranch,
    revealInFinder,
    sortColumn,
    sortDirection,
    toggleSort,
  };
}
