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
 */
export function TitleBar({ onAdd, onRefreshAll, refreshDisabled, refreshing }: Props) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 items-center justify-between pl-20 pr-3"
    >
      <div />
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
