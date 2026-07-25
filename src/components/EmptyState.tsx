import { useCallback, useRef, useState } from "react";
import { FolderPlus } from "lucide-react";
import { AsciiRipple } from "./AsciiRipple";

type Props = {
  onAdd: () => void;
};

/** Centered empty state per DESIGN.md / design/app-empty-state.png. */
export function EmptyState({ onAdd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const rippling = hovered || focused;

  const updateOrigin = useCallback(() => {
    const container = containerRef.current;
    const button = buttonRef.current;
    if (!container || !button) return;
    const c = container.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    setOrigin({
      x: b.left + b.width / 2 - c.left,
      y: b.top + b.height / 2 - c.top,
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      <AsciiRipple active={rippling} origin={origin} />

      <div className="relative z-10 mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <FolderPlus className="h-6 w-6 text-slate-600" />
      </div>
      <h2 className="relative z-10 mb-2 text-md font-semibold text-foreground">
        No repositories yet
      </h2>
      <p className="relative z-10 mb-5 max-w-[380px] text-sm text-slate-500">
        Add local folders to track branch, status, and remote state
      </p>
      <button
        ref={buttonRef}
        type="button"
        onClick={onAdd}
        onMouseEnter={() => {
          updateOrigin();
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => {
          updateOrigin();
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        className="relative z-10 inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
      >
        <FolderPlus className="h-4 w-4" />
        Add folders
      </button>
    </div>
  );
}
