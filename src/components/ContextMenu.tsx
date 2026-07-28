import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  RefreshCcw,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GitBranch,
  Folder,
  FolderMinus,
  Loader2,
} from "lucide-react";

export type ContextMenuAction =
  | "refresh"
  | "pull"
  | "push"
  | "sync"
  | "switch-branch"
  | "reveal"
  | "remove";

type Props = {
  x: number;
  y: number;
  /** When set, the menu stays open and shows the mid-action busy state. */
  runningAction?: ContextMenuAction | null;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
};

const MENU_WIDTH = 208;

const PRESENT_TENSE: Partial<Record<ContextMenuAction, string>> = {
  refresh: "Refreshing…",
  pull: "Pulling…",
  push: "Pushing…",
  sync: "Syncing…",
};

/**
 * Custom right-click menu per DESIGN.md "Context menu": 208px, white surface,
 * 8px radius, floating shadow, 4px padding. The caller resolves whether the
 * menu targets its row alone or the current multi-selection.
 *
 * While an action runs (Paper processing state): its icon becomes the spinner,
 * label goes present-tense ("Pulling…"), and sibling items dim to 40%.
 */
export function ContextMenu({ x, y, runningAction = null, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, visible: false });
  const busy = runningAction !== null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(x, window.innerWidth - rect.width - margin);
    const top = Math.min(y, window.innerHeight - rect.height - margin);
    setPosition({ left: Math.max(margin, left), top: Math.max(margin, top), visible: true });
  }, [x, y]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      // Keep the menu mounted while an action runs so the busy state stays visible.
      if (busy) return;
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    function handleScroll() {
      if (!busy) onClose();
    }
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose, busy]);

  function act(action: ContextMenuAction) {
    if (busy) return;
    onAction(action);
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-busy={busy || undefined}
      className="fixed z-50 rounded-lg border border-border bg-surface p-1 shadow-floating"
      style={{
        left: position.left,
        top: position.top,
        width: MENU_WIDTH,
        visibility: position.visible ? "visible" : "hidden",
      }}
    >
      <MenuItem
        icon={RefreshCcw}
        label="Refresh"
        runningAction={runningAction}
        action="refresh"
        onClick={() => act("refresh")}
      />
      <MenuItem
        icon={ArrowDown}
        label="Pull"
        runningAction={runningAction}
        action="pull"
        onClick={() => act("pull")}
      />
      <MenuItem
        icon={ArrowUp}
        label="Push"
        runningAction={runningAction}
        action="push"
        onClick={() => act("push")}
      />
      <MenuItem
        icon={ArrowUpDown}
        label="Sync"
        runningAction={runningAction}
        action="sync"
        onClick={() => act("sync")}
      />
      <MenuItem
        icon={GitBranch}
        label="Switch branch"
        runningAction={runningAction}
        action="switch-branch"
        onClick={() => act("switch-branch")}
      />
      <Divider />
      <MenuItem
        icon={Folder}
        label="Reveal in Finder"
        runningAction={runningAction}
        action="reveal"
        onClick={() => act("reveal")}
      />
      <Divider />
      <MenuItem
        icon={FolderMinus}
        label="Remove folder"
        runningAction={runningAction}
        action="remove"
        onClick={() => act("remove")}
        destructive
      />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  action,
  runningAction,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action: ContextMenuAction;
  runningAction: ContextMenuAction | null;
  onClick: () => void;
  destructive?: boolean;
}) {
  const isRunning = runningAction === action;
  const dimmed = runningAction !== null && !isRunning;
  const displayLabel = isRunning ? (PRESENT_TENSE[action] ?? label) : label;

  return (
    <button
      type="button"
      role="menuitem"
      disabled={dimmed || isRunning}
      aria-disabled={dimmed || isRunning || undefined}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2.5 rounded-[5px] px-2 text-left text-sm transition-colors disabled:pointer-events-none ${
        isRunning
          ? "bg-slate-100 text-slate-500"
          : dimmed
            ? "opacity-40 text-foreground"
            : destructive
              ? "text-red-700 hover:bg-red-50"
              : "text-foreground hover:bg-slate-100"
      }`}
    >
      {isRunning ? (
        <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin" />
      ) : (
        <Icon className="h-[15px] w-[15px] shrink-0" />
      )}
      {displayLabel}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-border" />;
}
