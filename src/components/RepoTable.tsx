import { useCallback, useRef, useState } from "react";
import { RepoRow } from "./RepoRow";
import type { RepoRow as RepoRowType, SortColumn, SortDirection } from "../types";
import { useColumnWidths } from "../hooks/useColumnWidths";
import type { ResizableColumn } from "../hooks/useColumnWidths";

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

const RESIZABLE: ResizableColumn[] = ["folder", "repo", "branch"];
const HIT_ZONE_PX = 6;

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
  const { widths, setColumnWidth } = useColumnWidths();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragGuideLeft, setDragGuideLeft] = useState<number | null>(null);

  const headers: { key: SortColumn | "status" | "remote"; label: string; width?: number; sortable: boolean }[] = [
    { key: "folder", label: "Folder", width: widths.folder, sortable: true },
    { key: "repo", label: "Repo", width: widths.repo, sortable: true },
    { key: "branch", label: "Branch", width: widths.branch, sortable: true },
    { key: "status", label: "Status", width: 120, sortable: false },
    { key: "remote", label: "Remote", sortable: false },
  ];

  const startResize = useCallback(
    (column: ResizableColumn, event: React.PointerEvent) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const startX = event.clientX;
      const startWidth = widths[column];
      const containerRect = container.getBoundingClientRect();

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function updateGuide(clientX: number) {
        setDragGuideLeft(clientX - containerRect.left);
      }
      updateGuide(startX);

      function onMove(moveEvent: PointerEvent) {
        const delta = moveEvent.clientX - startX;
        setColumnWidth(column, startWidth + delta);
        updateGuide(moveEvent.clientX);
      }
      function onUp() {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragGuideLeft(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [widths, setColumnWidth],
  );

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-col px-4">
      <div className="flex h-8 shrink-0 items-center text-sm font-medium text-slate-500">
        <div className="w-9 shrink-0" aria-hidden />
        {headers.map((header) => {
          const isSorted = header.sortable && header.key === sortColumn;
          const resizable = RESIZABLE.includes(header.key as ResizableColumn);
          return (
            <div
              key={header.key}
              className={`relative shrink-0 ${header.width ? "" : "min-w-0 flex-1"}`}
              style={header.width ? { width: header.width } : undefined}
            >
              <button
                type="button"
                disabled={!header.sortable}
                onClick={() => header.sortable && onSort(header.key as SortColumn)}
                className={`block truncate pr-3 text-left text-sm font-medium text-slate-500 ${
                  header.width ? "" : "w-full"
                } ${header.sortable ? "cursor-pointer hover:text-slate-700" : "cursor-default"}`}
                style={header.width ? { width: header.width } : undefined}
              >
                {header.label}
                {isSorted ? ` ${arrow}` : ""}
              </button>
              {resizable && header.width !== undefined && (
                <div
                  onPointerDown={(event) => startResize(header.key as ResizableColumn, event)}
                  className="absolute top-0 h-8 cursor-col-resize"
                  style={{
                    left: header.width - HIT_ZONE_PX / 2,
                    width: HIT_ZONE_PX,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
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
            widths={widths}
          />
        ))}
      </div>

      {dragGuideLeft !== null && (
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-slate-400"
          style={{ left: dragGuideLeft }}
        />
      )}
    </div>
  );
}
