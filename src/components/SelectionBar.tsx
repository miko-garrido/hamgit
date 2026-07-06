import { RefreshCcw, ArrowDown, ArrowUp, ArrowUpDown, FolderMinus, X, Loader2 } from "lucide-react";

export type SelectionBarAction = "refresh" | "pull" | "push" | "sync" | "remove";

type Props = {
  count: number;
  runningAction: SelectionBarAction | null;
  onAction: (action: SelectionBarAction) => void;
  onClear: () => void;
};

/**
 * Floating pill, fixed bottom-center, per DESIGN.md "Selection bar". Appears
 * when selection > 0. During a bulk action the running icon spins and every
 * other button dims to 40% and is disabled.
 */
export function SelectionBar({ count, runningAction, onAction, onClear }: Props) {
  if (count === 0) return null;
  const busy = runningAction !== null;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-surface py-1.5 pl-4 pr-2 shadow-floating"
    >
      <span className="mr-1 text-sm font-medium text-foreground">{count} selected</span>

      <BarButton
        icon={RefreshCcw}
        label="Refresh"
        action="refresh"
        runningAction={runningAction}
        busy={busy}
        onAction={onAction}
      />
      <BarButton
        icon={ArrowDown}
        label="Pull"
        action="pull"
        runningAction={runningAction}
        busy={busy}
        onAction={onAction}
      />
      <BarButton
        icon={ArrowUp}
        label="Push"
        action="push"
        runningAction={runningAction}
        busy={busy}
        onAction={onAction}
      />
      <BarButton
        icon={ArrowUpDown}
        label="Sync"
        action="sync"
        runningAction={runningAction}
        busy={busy}
        onAction={onAction}
      />
      <BarButton
        icon={FolderMinus}
        label="Remove folder"
        action="remove"
        runningAction={runningAction}
        busy={busy}
        onAction={onAction}
        destructive
      />

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        type="button"
        aria-label="Clear selection"
        title="Clear selection"
        disabled={busy}
        onClick={onClear}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function BarButton({
  icon: Icon,
  label,
  action,
  runningAction,
  busy,
  onAction,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action: SelectionBarAction;
  runningAction: SelectionBarAction | null;
  busy: boolean;
  onAction: (action: SelectionBarAction) => void;
  destructive?: boolean;
}) {
  const isRunning = runningAction === action;
  const disabled = busy && !isRunning;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || isRunning}
      onClick={() => onAction(action)}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors disabled:hover:bg-transparent ${
        disabled ? "opacity-40" : ""
      } ${destructive ? "hover:bg-red-50 hover:text-red-700" : "hover:bg-slate-100 hover:text-slate-900"}`}
    >
      {isRunning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
    </button>
  );
}
