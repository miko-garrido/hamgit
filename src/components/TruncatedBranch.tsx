import { useLayoutEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

type Props = {
  children: string;
  className?: string;
};

/**
 * Branch cell text per DESIGN.md "Row states & behavior": tooltip shows the
 * full branch name ONLY when the label is actually truncated (scrollWidth >
 * clientWidth), never unconditionally.
 */
export function TruncatedBranch({ children, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setTruncated(el.scrollWidth > el.clientWidth);
  }, [children]);

  const label = <span ref={ref} className={className}>{children}</span>;

  if (!truncated) return label;
  return (
    <Tooltip label={children} mono>
      {label}
    </Tooltip>
  );
}
