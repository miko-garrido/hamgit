import { useState } from "react";
import { useRepos } from "./hooks/useRepos";
import { useSelection } from "./hooks/useSelection";
import { useDialogs } from "./hooks/useDialogs";
import { TitleBar } from "./components/TitleBar";
import { RepoTable } from "./components/RepoTable";
import { EmptyState } from "./components/EmptyState";
import { ContextMenu } from "./components/ContextMenu";
import type { ContextMenuAction } from "./components/ContextMenu";
import { SelectionBar } from "./components/SelectionBar";
import type { SelectionBarAction } from "./components/SelectionBar";
import { Dialog } from "./components/Dialog";
import { BranchPalette } from "./components/BranchPalette";
import { errorSummary, formatList } from "./lib/format";
import type { RepoRow, BulkActionResult } from "./types";

type MenuState = { folder: string; x: number; y: number } | null;
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
  const { selected, isSelected, toggle, clear, handleRowClick, setSelected } = useSelection();
  const { dialog, show, dismiss } = useDialogs();

  const [menu, setMenu] = useState<MenuState>(null);
  const [palette, setPalette] = useState<PaletteState>(null);
  const [runningBarAction, setRunningBarAction] = useState<SelectionBarAction | null>(null);

  const isRefreshing = rows.some((row) => row.refreshing);
  const hasRepos = rows.length > 0;

  function onRowClick(folder: string, order: string[], event: React.MouseEvent) {
    handleRowClick(folder, order, { metaKey: event.metaKey, shiftKey: event.shiftKey });
  }

  function onContextMenu(folder: string, event: React.MouseEvent) {
    event.preventDefault();
    setMenu({ folder, x: event.clientX, y: event.clientY });
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
    opts: { fromSelectionBar: boolean; silentOnFullSuccess?: boolean },
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
    opts: { fromSelectionBar: boolean; silentOnFullSuccess?: boolean },
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

    if (opts.fromSelectionBar && !opts.silentOnFullSuccess) {
      show({
        variant: "message",
        title: `${verbPastTense(verb)} ${succeeded.length} repo${succeeded.length === 1 ? "" : "s"}`,
        body: `All ${succeeded.length} selected repo${succeeded.length === 1 ? "" : "s"} ${succeeded.length === 1 ? "is" : "are"} now up to date.`,
        confirmLabel: "OK",
        onConfirm: dismiss,
        onCancel: dismiss,
      });
    }
    // Single-repo context-menu action on success: silent, the row shows the result.
  }

  function handleMenuAction(action: ContextMenuAction) {
    if (!menu) return;
    const folder = menu.folder;
    const targetRows = rowsFor([folder]);
    // A row already running an action must not start a second one — a push
    // overwriting a mid-flight sync would break its pull-then-push atomicity.
    if (targetRows.some((row) => row.acting) && action !== "reveal") return;

    switch (action) {
      case "refresh":
        void refreshFolders([folder]);
        break;
      case "pull":
        void runBulk("pull", targetRows, { fromSelectionBar: false });
        break;
      case "push":
        void runBulk("push", targetRows, { fromSelectionBar: false });
        break;
      case "sync":
        void runBulk("sync", targetRows, { fromSelectionBar: false });
        break;
      case "switch-branch":
        onSwitchBranch(folder);
        break;
      case "reveal":
        void revealInFinder(folder);
        break;
      case "remove":
        confirmRemove([folder]);
        break;
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
      await refreshFolders(folders);
      setRunningBarAction(null);
      return;
    }

    setRunningBarAction(action);
    try {
      await runBulk(action, targetRows, { fromSelectionBar: true });
    } finally {
      setRunningBarAction(null);
    }
  }

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar
        onAdd={addRepositories}
        onRefreshAll={() => refreshFolders(rows.map((row) => row.folder))}
        refreshDisabled={!hasRepos}
        refreshing={isRefreshing}
      />

      <section className="min-h-0 flex-1">
        {hasRepos ? (
          <RepoTable
            rows={rows}
            isSelected={isSelected}
            onToggle={toggle}
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
          onAction={handleMenuAction}
          onClose={() => setMenu(null)}
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
