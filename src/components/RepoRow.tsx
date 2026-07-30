import { Check, Loader2 } from "lucide-react";
import { StatusIcon } from "./StatusIcon";
import { Tooltip } from "./Tooltip";
import { TruncatedBranch } from "./TruncatedBranch";
import { folderDisplay, remoteDisplay, remoteTooltip } from "../lib/format";
import type { RepoRow as RepoRowType } from "../types";
import type { ColumnWidths } from "../hooks/useColumnWidths";

type Props = {
  row: RepoRowType;
  isSelected: boolean;
  prevSelected: boolean;
  nextSelected: boolean;
  onToggle: (folder: string, event: React.MouseEvent) => void;
  onRowClick: (folder: string, event: React.MouseEvent) => void;
  onContextMenu?: (folder: string, event: React.MouseEvent) => void;
  widths: ColumnWidths;
  /** Floor for the flex Remote column so it never collapses below its
   * longest resting value ("Up to date" / "↑ 1, ↓ 4"). */
  remoteMinWidth: number;
};

/**
 * A single 44px table row. Adjacent selected rows merge: the run's outer
 * corners round 6px, shared inner edges stay square. Hover never merges
 * with a neighboring selection (it renders its own independent fill).
 */
export function RepoRow({
  row,
  isSelected,
  prevSelected,
  nextSelected,
  onToggle,
  onRowClick,
  onContextMenu,
  widths,
  remoteMinWidth,
}: Props) {
  const radiusTop = isSelected && !prevSelected;
  const radiusBottom = isSelected && !nextSelected;

  const borderRadius = isSelected
    ? `${radiusTop ? "6px" : "0"} ${radiusTop ? "6px" : "0"} ${radiusBottom ? "6px" : "0"} ${radiusBottom ? "6px" : "0"}`
    : undefined;

  const branchLabel = row.isDetached ? "Detached" : row.branch ?? "-";

  return (
    <div
      role="row"
      onClick={(event) => onRowClick(row.folder, event)}
      onContextMenu={(event) => onContextMenu?.(row.folder, event)}
      className={`group relative z-0 flex h-11 items-center text-sm ${
        isSelected ? "bg-row-selected" : "hover:bg-row-hover hover:rounded-md"
      }`}
      style={isSelected ? { backgroundColor: "var(--row-selected)", borderRadius } : undefined}
    >
      <div className="flex w-9 shrink-0 items-center justify-center">
        <button
          type="button"
          aria-label={isSelected ? "Deselect row" : "Select row"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(row.folder, event);
          }}
          className={`flex h-4 w-4 items-center justify-center rounded border transition-opacity ${
            isSelected
              ? "border-foreground bg-foreground opacity-100"
              : "border-slate-400 bg-white opacity-0 group-hover:opacity-100"
          }`}
        >
          {isSelected && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
        </button>
      </div>

      <div style={{ width: widths.folder }} className="shrink-0 truncate pr-3">
        <Tooltip label={row.folder} mono>
          <span className="block truncate font-mono text-xs text-foreground">
            {folderDisplay(row.folder)}
          </span>
        </Tooltip>
      </div>

      <div style={{ width: widths.repo }} className="shrink-0 truncate pr-3">
        {/* Repo tooltip: owner/repo when available, else repo name. There is
            no origin data source yet (see lib/format.ts ownerRepoFromOrigin),
            so this falls back to the repo name for now. */}
        <Tooltip label={row.repo}>
          <span className="block truncate text-base font-medium">{row.repo}</span>
        </Tooltip>
      </div>

      <div style={{ width: widths.branch }} className="shrink-0 truncate pr-3 font-mono text-xs text-foreground">
        {!row.loaded ? (
          <span className="text-slate-400">–</span>
        ) : row.acting && row.actingVerb === "switch" ? (
          <span className="flex items-center gap-1.5 text-slate-500" aria-live="polite">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="truncate">{row.note ?? "Switching…"}</span>
          </span>
        ) : (
          <TruncatedBranch className="block truncate">{branchLabel}</TruncatedBranch>
        )}
      </div>

      <div className="flex w-[120px] shrink-0 items-center pr-3">
        {row.loaded ? (
          <StatusIcon status={row.status} errorMessage={row.error} />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading" />
        )}
      </div>

      <div
        className="flex min-w-0 flex-1 items-center truncate pr-2 text-xs text-slate-500"
        style={{ minWidth: remoteMinWidth }}
      >
        {!row.loaded ? (
          ""
        ) : row.acting && (row.actingVerb === "pull" || row.actingVerb === "push" || row.actingVerb === "sync") ? (
          <span className="flex items-center gap-1.5" aria-live="polite">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            {row.actingVerb === "pull" ? "Pulling…" : row.actingVerb === "push" ? "Pushing…" : "Syncing…"}
          </span>
        ) : (
          <Tooltip label={remoteTooltip(row.remote)}>
            <span className="block truncate">{remoteDisplay(row.remote)}</span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
