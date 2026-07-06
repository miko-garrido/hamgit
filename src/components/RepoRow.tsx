import { Check, Loader2 } from "lucide-react";
import { StatusIcon } from "./StatusIcon";
import { folderDisplay, remoteDisplay, remoteTooltip } from "../lib/format";
import type { RepoRow as RepoRowType } from "../types";

type Props = {
  row: RepoRowType;
  isSelected: boolean;
  prevSelected: boolean;
  nextSelected: boolean;
  onToggle: (folder: string) => void;
  onRowClick: (folder: string, event: React.MouseEvent) => void;
  onContextMenu?: (folder: string, event: React.MouseEvent) => void;
};

/**
 * A single 44px table row. Adjacent selected rows merge: the run's outer
 * corners round 6px, shared inner edges stay square. Hover never merges
 * with a neighboring selection (it renders its own independent fill).
 */
export function RepoRow({ row, isSelected, prevSelected, nextSelected, onToggle, onRowClick, onContextMenu }: Props) {
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
      className={`group relative flex h-11 items-center text-sm ${
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
            onToggle(row.folder);
          }}
          className={`flex h-4 w-4 items-center justify-center rounded border transition-opacity ${
            isSelected
              ? "border-slate-900 bg-slate-900 opacity-100"
              : "border-slate-400 bg-white opacity-0 group-hover:opacity-100"
          }`}
        >
          {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>
      </div>

      <div
        className="w-[340px] shrink-0 truncate pr-3 font-mono text-xs text-foreground"
        title={row.folder}
      >
        {folderDisplay(row.folder)}
      </div>

      <div className="w-[160px] shrink-0 truncate pr-3 text-base font-medium" title={row.repo}>
        {row.repo}
      </div>

      <div className="w-[140px] shrink-0 truncate pr-3 font-mono text-xs text-foreground" title={row.loaded ? branchLabel : undefined}>
        {!row.loaded ? (
          <span className="text-slate-400">–</span>
        ) : row.acting && row.note?.startsWith("Switching") ? (
          <span className="text-slate-500">{row.note}</span>
        ) : (
          branchLabel
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
        className="min-w-0 flex-1 truncate pr-2 text-xs text-slate-500"
        title={row.loaded ? remoteTooltip(row.remote) : undefined}
      >
        {!row.loaded
          ? ""
          : row.acting && row.note?.startsWith("Pulling")
            ? row.note
            : remoteDisplay(row.remote)}
      </div>
    </div>
  );
}
