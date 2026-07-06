import { RepoRow } from "./RepoRow";
import type { RepoRow as RepoRowType, SortColumn, SortDirection } from "../types";

type Props = {
  rows: RepoRowType[];
  isSelected: (folder: string) => boolean;
  onToggle: (folder: string) => void;
  onRowClick: (folder: string, order: string[], event: React.MouseEvent) => void;
  onContextMenu?: (folder: string, event: React.MouseEvent) => void;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
};

const HEADERS: { key: SortColumn | "status" | "remote"; label: string; width: string; sortable: boolean }[] = [
  { key: "folder", label: "Folder", width: "340px", sortable: true },
  { key: "repo", label: "Repo", width: "160px", sortable: true },
  { key: "branch", label: "Branch", width: "140px", sortable: true },
  { key: "status", label: "Status", width: "120px", sortable: false },
  { key: "remote", label: "Remote", width: "", sortable: false },
];

export function RepoTable({
  rows,
  isSelected,
  onToggle,
  onRowClick,
  onContextMenu,
  sortColumn,
  sortDirection,
  onSort,
}: Props) {
  const order = rows.map((row) => row.folder);
  const arrow = sortDirection === "asc" ? "↑" : "↓";

  return (
    <div className="flex h-full min-h-0 flex-col px-4">
      <div className="flex h-8 shrink-0 items-center text-sm font-medium text-slate-500">
        <div className="w-9 shrink-0" aria-hidden />
        {HEADERS.map((header) => {
          const isSorted = header.sortable && header.key === sortColumn;
          return (
            <button
              key={header.key}
              type="button"
              disabled={!header.sortable}
              onClick={() => header.sortable && onSort(header.key as SortColumn)}
              className={`shrink-0 truncate pr-3 text-left text-sm font-medium text-slate-500 ${
                header.sortable ? "cursor-pointer hover:text-slate-700" : "cursor-default"
              } ${header.width ? "" : "flex-1"}`}
              style={header.width ? { width: header.width } : undefined}
            >
              {header.label}
              {isSorted ? ` ${arrow}` : ""}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.map((row, index) => (
          <RepoRow
            key={row.folder}
            row={row}
            isSelected={isSelected(row.folder)}
            prevSelected={index > 0 ? isSelected(rows[index - 1].folder) : false}
            nextSelected={index < rows.length - 1 ? isSelected(rows[index + 1].folder) : false}
            onToggle={onToggle}
            onRowClick={(folder, event) => onRowClick(folder, order, event)}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  );
}
