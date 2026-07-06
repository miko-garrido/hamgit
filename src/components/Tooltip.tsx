import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Tooltip label text. */
  label: string;
  /** Render mono font — used for paths/branch names. */
  mono?: boolean;
  /** Place above the anchor instead of below (selection bar buttons). */
  placement?: "top" | "bottom";
  /** Suppress the tooltip entirely (disabled/processing anchors never show one). */
  disabled?: boolean;
  children: React.ReactElement;
};

const HOVER_DELAY_MS = 300;
/** If a tooltip was visible within this window, the next one shows instantly. */
const WARM_WINDOW_MS = 150;

/** Shared "warm" timer: tracks the last time any tooltip was dismissed. */
let lastHideAt = 0;

/**
 * Dark pill tooltip per DESIGN.md "Icon buttons" / "Row states & behavior".
 * 0.3s hover delay, no re-delay between adjacent anchors (shared warm
 * window), instant show/hide (no motion), rendered via a portal so table
 * overflow can't clip it. Never shown while the anchor is disabled.
 */
export function Tooltip({ label, mono, placement = "bottom", disabled, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function show() {
    if (disabled) return;
    const now = Date.now();
    const warm = now - lastHideAt < WARM_WINDOW_MS;
    clearTimer();
    if (warm) {
      setVisible(true);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setVisible(true);
    }, HOVER_DELAY_MS);
  }

  function hide() {
    clearTimer();
    if (visible) lastHideAt = Date.now();
    setVisible(false);
  }

  useEffect(() => () => clearTimer(), []);

  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const width = tooltipEl?.offsetWidth ?? 0;
    const height = tooltipEl?.offsetHeight ?? 0;
    const gap = 4;
    const margin = 8;

    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    const top = placement === "top" ? anchorRect.top - height - gap : anchorRect.bottom + gap;

    setCoords({ left, top });
  }, [visible, placement, label]);

  const child = children;
  const existingRef = (child as unknown as { ref?: React.Ref<HTMLElement> }).ref;

  const element = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      if (typeof existingRef === "function") existingRef(node);
      else if (existingRef && typeof existingRef === "object") {
        (existingRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (event: React.MouseEvent) => {
      child.props.onMouseEnter?.(event);
      show();
    },
    onMouseLeave: (event: React.MouseEvent) => {
      child.props.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event: React.FocusEvent) => {
      child.props.onFocus?.(event);
      show();
    },
    onBlur: (event: React.FocusEvent) => {
      child.props.onBlur?.(event);
      hide();
    },
    onMouseDown: (event: React.MouseEvent) => {
      child.props.onMouseDown?.(event);
      hide();
    },
  } as Partial<unknown>);

  return (
    <>
      {element}
      {visible &&
        !disabled &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className={`pointer-events-none fixed z-[100] rounded-md bg-slate-800 px-2 py-1 text-xs text-white ${mono ? "font-mono" : ""}`}
            style={{
              left: coords?.left ?? -9999,
              top: coords?.top ?? -9999,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
