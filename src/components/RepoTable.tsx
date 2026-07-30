import { useCallback, useRef, useState } from "react";
import { Check, Minus } from "lucide-react";
import { RepoRow } from "./RepoRow";
import type { RepoRow as RepoRowType, SortColumn, SortDirection } from "../types";
import { useColumnWidths } from "../hooks/useColumnWidths";
import type { ResizableColumn } from "../hooks/useColumnWidths";

type Props = {
  rows: RepoRowType[];
  isSelected: (folder: string) => boolean;
  onToggleAll: (order: string[]) => void;
  onToggle: (folder: string, order: string[], event: React.MouseEvent) => void;
  onRowClick: (folder: string, order: string[], event: React.MouseEvent) => void;
  onContextMenu?: (folder: string, event: React.MouseEvent) => void;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
};

const RESIZABLE: ResizableColumn[] = ["folder", "repo", "branch"];
const HIT_ZONE_PX = 6;
// Checkbox lane + Status lane widths (fixed, per DESIGN.md "Columns").
const CHECKBOX_WIDTH = 36;
const STATUS_WIDTH = 120;
// Remote never collapses below its longest resting value ("Up to date" /
// "↑ 1, ↓ 4") — see DESIGN.md "Remote: ... arrow notation".
const REMOTE_MIN_WIDTH = 160;
// 16px horizontal padding on each side of the table, per DESIGN.md "Table".
const SIDE_PADDING = 32;

export function RepoTable({
  rows,
  isSelected,
  onToggleAll,
  onToggle,
  onRowClick,
  onContextMenu,
  sortColumn,
  sortDirection,
  onSort,
}: Props) {
  const order = rows.map((row) => row.folder);
  const selectedCount = order.reduce((count, folder) => count + (isSelected(folder) ? 1 : 0), 0);
  const allSelected = order.length > 0 && selectedCount === order.length;
  const partiallySelected = selectedCount > 0 && !allSelected;
  const arrow = sortDirection === "asc" ? "↑" : "↓";
  const { widths, setColumnWidth } = useColumnWidths();
  // This ref is the single element that scrolls both axes (header + rows
  // live inside it). Drag-guide math reads its scrollLeft/getBoundingClientRect
  // so the guide lines up with the pointer even mid-scroll.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragGuideLeft, setDragGuideLeft] = useState<number | null>(null);

  const headers: { key: SortColumn | "status" | "remote"; label: string; width?: number; sortable: boolean }[] = [
    { key: "folder", label: "Folder", width: widths.folder, sortable: true },
    { key: "repo", label: "Repo", width: widths.repo, sortable: true },
    { key: "branch", label: "Branch", width: widths.branch, sortable: true },
    { key: "status", label: "Status", width: STATUS_WIDTH, sortable: false },
    { key: "remote", label: "Remote", sortable: false },
  ];

  // Inner content min-width: every fixed lane plus a floor for the flex
  // Remote column, plus the side padding that now lives on this element (it
  // needs to scroll away with the content instead of staying fixed).
  const contentMinWidth =
    CHECKBOX_WIDTH + widths.folder + widths.repo + widths.branch + STATUS_WIDTH + REMOTE_MIN_WIDTH + SIDE_PADDING;

  const startResize = useCallback(
    (column: ResizableColumn, event: React.PointerEvent) => {
      event.preventDefault();
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const startX = event.clientX;
      const startWidth = widths[column];
      const scrollRect = scrollEl.getBoundingClientRect();
      const startScrollLeft = scrollEl.scrollLeft;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      // Guide is rendered inside the scrolled content, so its "left" must be
      // expressed in content coordinates: pointer position relative to the
      // scroll container's viewport, plus however far we've scrolled.
      function updateGuide(clientX: number) {
        const currentScrollLeft = scrollEl?.scrollLeft ?? startScrollLeft;
        setDragGuideLeft(clientX - scrollRect.left + currentScrollLeft);
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
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative px-4" style={{ minWidth: contentMinWidth }}>
          <div className="sticky top-0 z-20 flex h-8 shrink-0 items-center bg-background text-sm font-medium text-slate-500">
            <div className="group/select-all flex w-9 shrink-0 items-center justify-center">
              <button
                type="button"
                role="checkbox"
                aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                aria-checked={partiallySelected ? "mixed" : allSelected}
                onClick={() => onToggleAll(order)}
                className={`flex h-4 w-4 items-center justify-center rounded border transition-[border-color,background-color,color,opacity] focus-visible:opacity-100 ${
                  allSelected || partiallySelected
                    ? "border-foreground bg-foreground text-background opacity-100"
                    : "border-slate-400 bg-surface opacity-0 hover:border-slate-600 group-hover/select-all:opacity-100"
                }`}
              >
                {allSelected ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : partiallySelected ? (
                  <Minus className="h-3 w-3" strokeWidth={3} />
                ) : null}
              </button>
            </div>
            {headers.map((header) => {
              const isSorted = header.sortable && header.key === sortColumn;
              const resizable = RESIZABLE.includes(header.key as ResizableColumn);
              return (
                <div
                  key={header.key}
                  className={`relative shrink-0 ${header.width ? "" : "min-w-0 flex-1"}`}
                  style={header.width ? { width: header.width } : { minWidth: REMOTE_MIN_WIDTH }}
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

          {rows.map((row, index) => (
            <RepoRow
              key={row.folder}
              row={row}
              isSelected={isSelected(row.folder)}
              prevSelected={index > 0 ? isSelected(rows[index - 1].folder) : false}
              nextSelected={index < rows.length - 1 ? isSelected(rows[index + 1].folder) : false}
              onToggle={(folder, event) => onToggle(folder, order, event)}
              onRowClick={(folder, event) => onRowClick(folder, order, event)}
              onContextMenu={onContextMenu}
              widths={widths}
              remoteMinWidth={REMOTE_MIN_WIDTH}
            />
          ))}

          {dragGuideLeft !== null && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-slate-400"
              style={{ left: dragGuideLeft }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
