import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ChevronsDown,
  Code2,
  FolderOpen,
  GitBranch,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import "./styles.css";

type StatusLabel = "Clean" | "Dirty" | "Conflict" | "Detached" | "Error";

type RemoteLabel =
  | "upToDate"
  | { ahead: number }
  | { behind: number }
  | { aheadBehind: { ahead: number; behind: number } }
  | "noUpstream"
  | "unknown";

type RepositoryState = {
  folder: string;
  repo: string;
  branch: string | null;
  status: StatusLabel;
  remote: RemoteLabel;
  isDirty: boolean;
  hasConflicts: boolean;
  isDetached: boolean;
  error: string | null;
};

type RepoRow = RepositoryState & {
  selected: boolean;
  refreshing: boolean;
  acting: boolean;
  note: string | null;
};

type ActionResult = {
  ok: boolean;
  message: string;
};

const STORAGE_KEY = "hamgit.repositories";
const INTERVAL_KEY = "hamgit.refreshIntervalSeconds";
const DEFAULT_REFRESH_SECONDS = 30;
const REFRESH_CONCURRENCY = 6;
const ACTION_CONCURRENCY = 3;

function loadFolders() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function loadInterval() {
  const value = Number(localStorage.getItem(INTERVAL_KEY));
  return Number.isFinite(value) && value >= 5 ? value : DEFAULT_REFRESH_SECONDS;
}

function folderName(folder: string) {
  const parts = folder.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}

function serializeRemote(remote: RemoteLabel) {
  if (remote === "upToDate") return "Up to date";
  if (remote === "noUpstream") return "No upstream";
  if (remote === "unknown") return "Unknown";
  if ("ahead" in remote) return `Ahead ${remote.ahead}`;
  if ("behind" in remote) return `Behind ${remote.behind}`;
  return `Ahead ${remote.aheadBehind.ahead}, behind ${remote.aheadBehind.behind}`;
}

function statusClass(status: StatusLabel) {
  if (status === "Clean") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Dirty") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "Conflict" || status === "Error") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
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

function App() {
  const [rows, setRows] = useState<RepoRow[]>([]);
  const [refreshInterval, setRefreshInterval] = useState(loadInterval);
  const [query, setQuery] = useState("");
  const [bulkBranch, setBulkBranch] = useState("main");
  const [lastRun, setLastRun] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  useEffect(() => {
    const folders = loadFolders();
    setRows(
      folders.map((folder) => ({
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
      })),
    );
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.map((row) => row.folder)));
  }, [rows]);

  useEffect(() => {
    localStorage.setItem(INTERVAL_KEY, String(refreshInterval));
  }, [refreshInterval]);

  const updateRow = useCallback((folder: string, patch: Partial<RepoRow>) => {
    setRows((current) =>
      current.map((row) => (row.folder === folder ? { ...row, ...patch } : row)),
    );
  }, []);

  const refreshFolders = useCallback(
    async (folders: string[]) => {
      if (folders.length === 0 || refreshInFlight.current) return;
      refreshInFlight.current = true;
      setLastRun(`Refreshing ${folders.length} repos`);
      folders.forEach((folder) => updateRow(folder, { refreshing: true, note: null }));

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

      refreshInFlight.current = false;
      setLastRun(`Refreshed ${folders.length} repos at ${new Date().toLocaleTimeString()}`);
    },
    [updateRow],
  );

  useEffect(() => {
    const folders = rows.map((row) => row.folder);
    if (folders.length > 0) void refreshFolders(folders);
  }, [rows.length, refreshFolders]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const folders = rows.filter((row) => !row.acting).map((row) => row.folder);
      void refreshFolders(folders);
    }, refreshInterval * 1000);

    return () => window.clearInterval(timer);
  }, [refreshFolders, refreshInterval, rows]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.folder, row.repo, row.branch ?? "", row.status, serializeRemote(row.remote)]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, rows]);

  const selectedRows = rows.filter((row) => row.selected);
  const cleanRows = rows.filter(
    (row) => row.status === "Clean" && !row.isDirty && !row.hasConflicts && !row.isDetached,
  );

  async function addRepository() {
    const selected = await open({ directory: true, multiple: true, title: "Add repositories" });
    const folders = Array.isArray(selected) ? selected : selected ? [selected] : [];
    const newFolders = folders.filter((folder) => !rows.some((row) => row.folder === folder));

    if (newFolders.length === 0) return;

    setRows((current) => [
      ...current,
      ...newFolders.map((folder) => ({
        folder,
        repo: folderName(folder),
        branch: null,
        status: "Error" as StatusLabel,
        remote: "unknown" as RemoteLabel,
        isDirty: false,
        hasConflicts: false,
        isDetached: false,
        error: null,
        selected: false,
        refreshing: false,
        acting: false,
        note: "Pending refresh",
      })),
    ]);

    await refreshFolders(newFolders);
  }

  function removeSelected() {
    setRows((current) => current.filter((row) => !row.selected));
  }

  function setAllSelected(selected: boolean) {
    const folders = new Set(filteredRows.map((row) => row.folder));
    setRows((current) =>
      current.map((row) => (folders.has(row.folder) ? { ...row, selected } : row)),
    );
  }

  async function openCode(folder: string) {
    const result = await invoke<ActionResult>("open_in_vscode", { folder });
    updateRow(folder, { note: result.message });
  }

  async function reveal(folder: string) {
    const result = await invoke<ActionResult>("reveal_in_finder", { folder });
    updateRow(folder, { note: result.message });
  }

  async function pullRows(targetRows: RepoRow[]) {
    const allowed = targetRows.filter((row) => row.status === "Clean" && !row.isDetached);
    const skipped = targetRows.length - allowed.length;
    if (skipped) setLastRun(`Skipped ${skipped} repos that are not clean`);

    await runLimited(allowed, ACTION_CONCURRENCY, async (row) => {
      updateRow(row.folder, { acting: true, note: "Pulling" });
      const result = await invoke<ActionResult>("pull_repository", { folder: row.folder });
      updateRow(row.folder, { acting: false, note: result.message });
      await refreshFolders([row.folder]);
    });
  }

  async function switchRows(targetRows: RepoRow[], branch: string, allowDetached = false) {
    const allowed = targetRows.filter(
      (row) =>
        !row.isDirty &&
        !row.hasConflicts &&
        (allowDetached || !row.isDetached) &&
        row.status !== "Error",
    );
    const skipped = targetRows.length - allowed.length;
    const skippedNames = targetRows
      .filter((row) => !allowed.some((allowedRow) => allowedRow.folder === row.folder))
      .map((row) => row.repo)
      .slice(0, 4)
      .join(", ");
    setLastRun(
      skipped
        ? `Skipped ${skipped} repos with dirty, conflict, detached, or error state${
            skippedNames ? `: ${skippedNames}` : ""
          }`
        : null,
    );

    await runLimited(allowed, ACTION_CONCURRENCY, async (row) => {
      updateRow(row.folder, { acting: true, note: `Switching to ${branch}` });
      const result = await invoke<ActionResult>("switch_repository", {
        folder: row.folder,
        branch,
      });
      updateRow(row.folder, { acting: false, note: result.message });
      await refreshFolders([row.folder]);
    });
  }

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-3 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-slate-700" />
            <h1 className="text-base font-semibold">Hamgit</h1>
          </div>
          <button className="button-primary" onClick={addRepository}>
            <Plus className="h-4 w-4" />
            Add
          </button>
          <button className="button" onClick={() => refreshFolders(rows.map((row) => row.folder))}>
            <RefreshCcw className="h-4 w-4" />
            Refresh all
          </button>
          <button className="button" onClick={() => refreshFolders(selectedRows.map((row) => row.folder))}>
            <RefreshCcw className="h-4 w-4" />
            Refresh selected
          </button>
          <button className="button" onClick={() => pullRows(cleanRows)}>
            <ChevronsDown className="h-4 w-4" />
            Pull all clean
          </button>
          <button className="button" onClick={() => pullRows(selectedRows)}>
            <ChevronsDown className="h-4 w-4" />
            Pull selected
          </button>
          <button className="button" onClick={() => switchRows(selectedRows, "main", true)}>
            <RotateCcw className="h-4 w-4" />
            Selected to main
          </button>
          <button className="button" onClick={() => switchRows(cleanRows, "main")}>
            <Check className="h-4 w-4" />
            All clean to main
          </button>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-slate-500" htmlFor="refresh-interval">
              Auto
            </label>
            <input
              id="refresh-interval"
              className="w-16 rounded-md border border-border px-2 py-1 text-sm"
              min={5}
              type="number"
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(Math.max(5, Number(event.target.value)))}
            />
            <span className="text-xs text-slate-500">sec</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-80 max-w-full">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-md border border-border py-1.5 pl-8 pr-3 text-sm"
              placeholder="Filter repositories"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <input
            className="w-44 rounded-md border border-border px-2 py-1.5 text-sm"
            value={bulkBranch}
            onChange={(event) => setBulkBranch(event.target.value)}
            aria-label="Branch"
          />
          <button className="button" onClick={() => switchRows(selectedRows, bulkBranch, true)}>
            <GitBranch className="h-4 w-4" />
            Switch selected
          </button>
          <button className="button-danger" onClick={removeSelected}>
            <Trash2 className="h-4 w-4" />
            Remove selected
          </button>
          {lastRun ? <p className="text-xs text-slate-500">{lastRun}</p> : null}
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-9 border-b border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={filteredRows.length > 0 && filteredRows.every((row) => row.selected)}
                  onChange={(event) => setAllSelected(event.target.checked)}
                />
              </th>
              <th className="border-b border-border px-3 py-2">Folder</th>
              <th className="border-b border-border px-3 py-2">Repo</th>
              <th className="border-b border-border px-3 py-2">Branch</th>
              <th className="border-b border-border px-3 py-2">Status</th>
              <th className="border-b border-border px-3 py-2">Remote</th>
              <th className="border-b border-border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.folder} className="border-b border-border odd:bg-white even:bg-slate-50/70">
                <td className="border-b border-border px-3 py-2 align-middle">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(event) => updateRow(row.folder, { selected: event.target.checked })}
                  />
                </td>
                <td className="max-w-[420px] border-b border-border px-3 py-2 font-mono text-xs">
                  <div className="truncate" title={row.folder}>
                    {row.folder}
                  </div>
                  {row.note ? <div className="mt-1 truncate text-[11px] text-slate-500">{row.note}</div> : null}
                </td>
                <td className="border-b border-border px-3 py-2 font-medium">{row.repo}</td>
                <td className="border-b border-border px-3 py-2 font-mono text-xs">
                  {row.isDetached ? "Detached" : row.branch ?? "-"}
                </td>
                <td className="border-b border-border px-3 py-2">
                  <span className={`inline-flex min-w-20 justify-center rounded border px-2 py-0.5 text-xs ${statusClass(row.status)}`}>
                    {row.refreshing ? "Refreshing" : row.acting ? "Working" : row.status}
                  </span>
                </td>
                <td className="border-b border-border px-3 py-2 text-xs">{serializeRemote(row.remote)}</td>
                <td className="border-b border-border px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button className="icon-button" title="Refresh" onClick={() => refreshFolders([row.folder])}>
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                    <button className="icon-button" title="Pull" onClick={() => pullRows([row])}>
                      <ChevronsDown className="h-4 w-4" />
                    </button>
                    <button className="icon-button" title="Switch to main" onClick={() => switchRows([row], "main", true)}>
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button className="icon-button" title="Open in VS Code" onClick={() => openCode(row.folder)}>
                      <Code2 className="h-4 w-4" />
                    </button>
                    <button className="icon-button" title="Reveal in Finder" onClick={() => reveal(row.folder)}>
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
            Add local repositories to start tracking their branch, status, and upstream state.
          </div>
        ) : null}
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
