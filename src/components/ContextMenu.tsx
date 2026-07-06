import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  RefreshCcw,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GitBranch,
  Folder,
  FolderMinus,
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
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
};

const MENU_WIDTH = 208;

/**
 * Custom right-click menu per DESIGN.md "Context menu": 208px, white surface,
 * 8px radius, floating shadow, 4px padding. Always operates on a single repo
 * (the caller resolves which folder before opening this).
 */
export function ContextMenu({ x, y, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, visible: false });

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
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  function act(action: ContextMenuAction) {
    onAction(action);
    onClose();
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 rounded-lg border border-border bg-surface p-1 shadow-floating"
      style={{
        left: position.left,
        top: position.top,
        width: MENU_WIDTH,
        visibility: position.visible ? "visible" : "hidden",
      }}
    >
      <MenuItem icon={RefreshCcw} label="Refresh" onClick={() => act("refresh")} />
      <MenuItem icon={ArrowDown} label="Pull" onClick={() => act("pull")} />
      <MenuItem icon={ArrowUp} label="Push" onClick={() => act("push")} />
      <MenuItem icon={ArrowUpDown} label="Sync" onClick={() => act("sync")} />
      <MenuItem icon={GitBranch} label="Switch branch" onClick={() => act("switch-branch")} />
      <Divider />
      <MenuItem icon={Folder} label="Reveal in Finder" onClick={() => act("reveal")} />
      <Divider />
      <MenuItem
        icon={FolderMinus}
        label="Remove folder"
        onClick={() => act("remove")}
        destructive
      />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-[5px] px-2 text-left text-sm transition-colors ${
        destructive ? "text-red-700 hover:bg-red-50" : "text-foreground hover:bg-slate-100"
      }`}
    >
      <Icon className="h-[15px] w-[15px] shrink-0" />
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-border" />;
}
