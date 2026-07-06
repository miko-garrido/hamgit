import { FolderPlus, RefreshCcw } from "lucide-react";
import { IconButton } from "./IconButton";

type Props = {
  onAdd: () => void;
  onRefreshAll: () => void;
  refreshDisabled?: boolean;
  refreshing?: boolean;
};

/**
 * 52px title bar with the native drag region. Left ~80px stays clear for
 * macOS traffic lights (trafficLightPosition is {x:20,y:20} in
 * tauri.conf.json). Interactive children must NOT inherit the drag region,
 * so the button wrapper opts out explicitly.
 *
 * `data-tauri-drag-region` only starts a drag when the mousedown event's
 * TARGET is an element carrying the attribute — it does not "leak" from a
 * parent to plain children. The left spacer below is an empty div that
 * covers most of the bar's width, so it must carry the attribute itself or
 * clicks/drags on that area would be swallowed silently.
 */
export function TitleBar({ onAdd, onRefreshAll, refreshDisabled, refreshing }: Props) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 items-center justify-between pl-20 pr-3"
    >
      <div data-tauri-drag-region className="h-full flex-1" />
      <div className="flex items-center gap-1" style={{ pointerEvents: "auto" }}>
        <IconButton icon={FolderPlus} label="Add folders" onClick={onAdd} />
        <IconButton
          icon={RefreshCcw}
          label="Refresh all"
          onClick={onRefreshAll}
          disabled={refreshDisabled}
          processing={refreshing}
        />
      </div>
    </div>
  );
}
