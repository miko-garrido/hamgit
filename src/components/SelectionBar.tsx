import { useEffect, useRef, useState } from "react";
import { RefreshCcw, ArrowDown, ArrowUp, ArrowUpDown, FolderMinus, X } from "lucide-react";
import { IconButton } from "./IconButton";

export type SelectionBarAction = "refresh" | "pull" | "push" | "sync" | "remove";

type Props = {
  count: number;
  runningAction: SelectionBarAction | null;
  onAction: (action: SelectionBarAction) => void;
  onClear: () => void;
};

/** Bar stays mounted this long after count returns to 0 so the exit animation can play. */
const EXIT_DURATION_MS = 150;

/**
 * Floating pill, fixed bottom-center, per DESIGN.md "Selection bar". Appears
 * when selection goes 0->1 (rise + fade in), stays mounted briefly with a
 * "leaving" state to play the exit animation when cleared, and never
 * re-animates while the count changes with the bar already open. During a
 * bulk action the running icon spins and every other button dims to 40%.
 */
export function SelectionBar({ count, runningAction, onAction, onClear }: Props) {
  const [mounted, setMounted] = useState(count > 0);
  const [leaving, setLeaving] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const lastCount = useRef(count);
  const lastNonZeroCount = useRef(count > 0 ? count : 1);

  useEffect(() => {
    const prevCount = lastCount.current;
    lastCount.current = count;
    if (count > 0) lastNonZeroCount.current = count;

    if (count > 0) {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setLeaving(false);
      setMounted(true);
      return;
    }

    if (prevCount > 0 && mounted) {
      setLeaving(true);
      exitTimer.current = window.setTimeout(() => {
        setMounted(false);
        setLeaving(false);
        exitTimer.current = null;
      }, EXIT_DURATION_MS);
    }
  }, [count, mounted]);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
  }, []);

  if (!mounted) return null;
  const busy = runningAction !== null;
  const displayCount = count > 0 ? count : lastNonZeroCount.current;

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-40 flex items-center gap-1 rounded-full border border-border bg-surface py-1.5 pl-4 pr-2 shadow-floating ${
        leaving ? "animate-selection-bar-out" : "animate-selection-bar-in"
      }`}
    >
      <span key={displayCount} className="mr-1 animate-count-crossfade text-sm font-medium text-foreground">
        {displayCount} selected
      </span>

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

      <IconButton
        icon={X}
        label="Clear selection"
        size="large"
        disabled={busy}
        onClick={onClear}
        tooltipPlacement="top"
      />
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
    <IconButton
      icon={Icon}
      label={label}
      size="large"
      destructive={destructive}
      disabled={disabled}
      processing={isRunning}
      onClick={() => onAction(action)}
      tooltipPlacement="top"
    />
  );
}
