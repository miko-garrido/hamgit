import { useState } from "react";
import { useRepos } from "./hooks/useRepos";
import { useSelection } from "./hooks/useSelection";
import { useDialogs } from "./hooks/useDialogs";
import { useAppUpdater } from "./hooks/useAppUpdater";
import { TitleBar } from "./components/TitleBar";
import { RepoTable } from "./components/RepoTable";
import { EmptyState } from "./components/EmptyState";
import { ContextMenu } from "./components/ContextMenu";
import type { ContextMenuAction } from "./components/ContextMenu";
import { SelectionBar } from "./components/SelectionBar";
import type { SelectionBarAction } from "./components/SelectionBar";
import { Dialog } from "./components/Dialog";
import { BranchPalette } from "./components/BranchPalette";
import { afterPaint } from "./lib/afterPaint";
import { errorSummary, formatList } from "./lib/format";
import { contextMenuTargets } from "./lib/selection";
import type { RepoRow, BulkActionResult } from "./types";

type MenuState = { folder: string; targetFolders: string[]; x: number; y: number } | null;
type PaletteState = { folder: string } | null;

/** Bulk verbs share pull/push/sync semantics; refresh and remove are handled separately. */
type BulkVerb = "pull" | "push" | "sync";

export function App() {
  const {
    rows,
    addRepositories,
    removeFolders,
    refreshFolders,
    pullRows,
    pushRows,
    syncRows,
    switchBranch,
    revealInFinder,
    sortColumn,
    sortDirection,
    toggleSort,
  } = useRepos();
  const { selected, isSelected, toggleAll, clear, handleSelectionClick, setSelected } = useSelection();
  const { dialog, show, dismiss } = useDialogs();
  useAppUpdater(show, dismiss);

  const [menu, setMenu] = useState<MenuState>(null);
  const [palette, setPalette] = useState<PaletteState>(null);
  const [runningBarAction, setRunningBarAction] = useState<SelectionBarAction | null>(null);
  const [runningMenuAction, setRunningMenuAction] = useState<ContextMenuAction | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const isRefreshing = rows.some((row) => row.refreshing);
  const hasRepos = rows.length > 0;

  function onRowClick(folder: string, order: string[], event: React.MouseEvent) {
    handleSelectionClick(folder, order, event, "row");
  }

  function onToggle(folder: string, order: string[], event: React.MouseEvent) {
    handleSelectionClick(folder, order, event, "checkbox");
  }

  function onContextMenu(folder: string, event: React.MouseEvent) {
    event.preventDefault();
    setMenu({
      folder,
      targetFolders: contextMenuTargets(folder, selected),
      x: event.clientX,
      y: event.clientY,
    });
  }

  function rowsFor(folders: string[]): RepoRow[] {
    const set = new Set(folders);
    return rows.filter((row) => set.has(row.folder));
  }

  function onSwitchBranch(folder: string) {
    const row = rowsFor([folder])[0];
    if (!row) return;
    // Conflicted repos are blocked outright, same "Can't switch" pattern as
    // the single-repo bulk-action skip path; dirty repos get a warning
    // instead (switching FROM detached is allowed — that's how you fix it).
    if (row.hasConflicts) {
      show({
        variant: "partial",
        title: `Can't switch ${row.repo}`,
        body: `${row.repo} has unresolved merge conflicts. Resolve them first, or check the status icon for details.`,
        confirmLabel: "OK",
        onConfirm: dismiss,
        onCancel: dismiss,
      });
      return;
    }
    setPalette({ folder });
  }

  async function performSwitch(folder: string, branch: string) {
    const result = await switchBranch(folder, branch);
    if (!result.ok) {
      const row = rowsFor([folder])[0];
      show({
        variant: "error",
        title: `Switch failed for ${row?.repo ?? folder}`,
        body: errorSummary("switch", result.message),
        detail: result.message,
        confirmLabel: "Retry switch",
        onConfirm: () => {
          dismiss();
          void performSwitch(folder, branch);
        },
        onCancel: dismiss,
      });
    }
  }

  function onPaletteSelect(folder: string, branch: string) {
    setPalette(null);
    const row = rowsFor([folder])[0];
    if (row?.isDirty) {
      show({
        variant: "warning",
        title: `${row.repo} has uncommitted changes`,
        body: `Switching to ${branch} will carry your local edits over to the new branch. Commit or stash first if you want a clean switch.`,
        confirmLabel: "Switch anyway",
        onConfirm: () => {
          dismiss();
          void performSwitch(folder, branch);
        },
        onCancel: dismiss,
      });
      return;
    }
    void performSwitch(folder, branch);
  }

  function removeAndDeselect(folders: string[]) {
    removeFolders(folders);
    setSelected((current) => {
      const next = new Set(current);
      folders.forEach((folder) => next.delete(folder));
      return next;
    });
  }

  function confirmRemove(folders: string[]) {
    const targetRows = rowsFor(folders);
    const names = targetRows.map((row) => row.repo).join(", ");
    show({
      variant: "destructive",
      title: `Remove ${folders.length} folder${folders.length === 1 ? "" : "s"} from Hamgit?`,
      body: `${names} will no longer be tracked here. The folder${folders.length === 1 ? "" : "s"} and everything in ${folders.length === 1 ? "it" : "them"} stay untouched on disk.`,
      confirmLabel: `Remove ${folders.length} folder${folders.length === 1 ? "" : "s"}`,
      onConfirm: () => {
        removeAndDeselect(folders);
        dismiss();
      },
      onCancel: dismiss,
    });
  }

  /** Runs a bulk pull/push/sync and applies the completion-policy dialog rules. */
  async function runBulk(
    verb: BulkVerb,
    targetRows: RepoRow[],
    opts: { showFullSuccess: boolean; successScope?: "selected" | "tracked" },
  ) {
    const runner = verb === "pull" ? pullRows : verb === "push" ? pushRows : syncRows;
    const result = await runner(targetRows);
    presentBulkResult(verb, result, opts);
    return result;
  }

  function verbPastTense(verb: BulkVerb): string {
    if (verb === "pull") return "Pulled";
    if (verb === "push") return "Pushed";
    return "Synced";
  }

  function presentBulkResult(
    verb: BulkVerb,
    result: BulkActionResult,
    opts: { showFullSuccess: boolean; successScope?: "selected" | "tracked" },
  ) {
    const { succeeded, failed, skipped } = result;
    const total = succeeded.length + failed.length + skipped.length;

    if (failed.length > 0) {
      const first = failed[0];
      show({
        variant: "error",
        title: `${verb[0].toUpperCase()}${verb.slice(1)} failed for ${first.repo}`,
        body: errorSummary(verb, first.message),
        detail: first.message,
        confirmLabel: `Retry ${verb}`,
        onConfirm: () => {
          dismiss();
          void runBulk(verb, rowsFor(failed.map((entry) => entry.folder)), opts);
        },
        onCancel: dismiss,
      });
      return;
    }

    if (skipped.length > 0) {
      if (total === 1) {
        // Single-repo action (context menu): the row was ineligible, not failed.
        show({
          variant: "partial",
          title: `Can't ${verb} ${skipped[0].repo}`,
          body: `${skipped[0].repo} has ${skipped[0].reason}. Resolve it first, or check the status icon for details.`,
          confirmLabel: "OK",
          onConfirm: dismiss,
          onCancel: dismiss,
        });
        return;
      }

      const names = formatList(skipped.map((entry) => entry.repo));
      const reasonSummary =
        new Set(skipped.map((entry) => entry.reason)).size === 1
          ? `they have ${skipped[0].reason}`
          : "they have uncommitted changes, conflicts, or a detached HEAD";
      show({
        variant: "partial",
        title: `${verbPastTense(verb)} ${succeeded.length} of ${total} repos`,
        body: `Skipped ${names} — ${reasonSummary}. Their status icons show the details.`,
        confirmLabel: "OK",
        onConfirm: dismiss,
        onCancel: dismiss,
      });
      return;
    }

    if (opts.showFullSuccess) {
      const scope = opts.successScope ?? "selected";
      show({
        variant: "message",
        title: `${verbPastTense(verb)} ${succeeded.length} repo${succeeded.length === 1 ? "" : "s"}`,
        body: `All ${succeeded.length} ${scope} repo${succeeded.length === 1 ? "" : "s"} ${succeeded.length === 1 ? "is" : "are"} now up to date.`,
        confirmLabel: "OK",
        onConfirm: dismiss,
        onCancel: dismiss,
      });
    }
    // Single-repo context-menu action on success: silent, the row shows the result.
  }

  async function handleMenuAction(action: ContextMenuAction) {
    if (!menu || runningMenuAction !== null) return;
    const folder = menu.folder;
    const targetFolders = menu.targetFolders;
    const targetRows = rowsFor(targetFolders);
    const clickedRow = rowsFor([folder])[0];
    // A row already running an action must not start a second one — a push
    // overwriting a mid-flight sync would break its pull-then-push atomicity.
    // Single-repo actions only care about the clicked row; another selected
    // row being busy must not block branch switching on this one.
    const guardedRows = action === "switch-branch" ? (clickedRow ? [clickedRow] : []) : targetRows;
    if (guardedRows.some((row) => row.acting) && action !== "reveal") return;

    // Instant UI actions: close the menu, then open palette / dialog / Finder.
    if (action === "switch-branch") {
      setMenu(null);
      onSwitchBranch(folder);
      return;
    }
    if (action === "remove") {
      setMenu(null);
      confirmRemove(targetFolders);
      return;
    }
    if (action === "reveal") {
      setMenu(null);
      void revealInFinder(folder);
      return;
    }

    // Long-running actions stay in the menu with spinner + present-tense label
    // (Paper processing / node mid-pull state) until the work finishes.
    setRunningMenuAction(action);
    await afterPaint();
    try {
      if (action === "refresh") {
        await refreshFolders(targetFolders);
      } else {
        await runBulk(action, targetRows, {
          showFullSuccess: targetRows.length > 1,
          successScope: "selected",
        });
      }
    } finally {
      setRunningMenuAction(null);
      setMenu(null);
    }
  }

  async function handleBarAction(action: SelectionBarAction) {
    // Guard against double-fire: a second click can land before React
    // re-renders the bar with its buttons disabled.
    if (runningBarAction !== null) return;
    const folders = Array.from(selected);
    if (folders.length === 0) return;
    const targetRows = rowsFor(folders);

    if (action === "remove") {
      confirmRemove(folders);
      return;
    }

    if (action === "refresh") {
      setRunningBarAction("refresh");
      await afterPaint();
      try {
        await refreshFolders(folders);
      } finally {
        setRunningBarAction(null);
      }
      return;
    }

    setRunningBarAction(action);
    await afterPaint();
    try {
      await runBulk(action, targetRows, { showFullSuccess: true, successScope: "selected" });
    } finally {
      setRunningBarAction(null);
    }
  }

  async function handleSyncAll() {
    if (syncingAll || rows.length === 0) return;
    setSyncingAll(true);
    await afterPaint();
    try {
      await runBulk("sync", rows, { showFullSuccess: true, successScope: "tracked" });
    } finally {
      setSyncingAll(false);
    }
  }

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar
        onAdd={addRepositories}
        onRefreshAll={() => refreshFolders(rows.map((row) => row.folder))}
        onSyncAll={() => {
          void handleSyncAll();
        }}
        refreshDisabled={!hasRepos || syncingAll}
        refreshing={isRefreshing}
        syncDisabled={!hasRepos || isRefreshing}
        syncing={syncingAll}
      />

      <section className="min-h-0 flex-1">
        {hasRepos ? (
          <RepoTable
            rows={rows}
            isSelected={isSelected}
            onToggleAll={toggleAll}
            onToggle={onToggle}
            onRowClick={onRowClick}
            onContextMenu={onContextMenu}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={toggleSort}
          />
        ) : (
          <EmptyState onAdd={addRepositories} />
        )}
      </section>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          runningAction={runningMenuAction}
          onAction={(action) => {
            void handleMenuAction(action);
          }}
          onClose={() => {
            if (runningMenuAction !== null) return;
            setMenu(null);
          }}
        />
      )}

      <SelectionBar
        count={selected.size}
        runningAction={runningBarAction}
        onAction={handleBarAction}
        onClear={clear}
      />

      {palette &&
        (() => {
          const row = rowsFor([palette.folder])[0];
          if (!row) return null;
          return (
            <BranchPalette
              repo={row.repo}
              folder={row.folder}
              currentBranch={row.branch}
              onSelect={(branch) => onPaletteSelect(row.folder, branch)}
              onClose={() => setPalette(null)}
            />
          );
        })()}

      {dialog && <Dialog spec={dialog} onDismiss={dismiss} />}
    </main>
  );
}
