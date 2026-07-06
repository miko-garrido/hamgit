import type { StatusLabel } from "../types";

type Props = {
  status: StatusLabel;
  errorMessage?: string | null;
};

const TOOLTIPS: Record<StatusLabel, string> = {
  Clean: "Clean — nothing uncommitted",
  Dirty: "Dirty — uncommitted changes",
  Conflict: "Conflict — unresolved merge conflicts",
  Detached: "Detached — HEAD is not on a branch",
  Error: "Error",
};

/**
 * 18px filled status icons per DESIGN.md. Colors come from the status-*
 * CSS variables; glyph strokes are white (a sanctioned hardcoded exception).
 */
export function StatusIcon({ status, errorMessage }: Props) {
  const title =
    status === "Error" && errorMessage ? `Error — ${errorMessage}` : TOOLTIPS[status];

  return (
    <span title={title} className="inline-flex h-[18px] w-[18px] shrink-0" aria-label={title}>
      {status === "Clean" && <CleanIcon />}
      {status === "Dirty" && <DirtyIcon />}
      {status === "Conflict" && <ConflictIcon />}
      {status === "Detached" && <DetachedIcon />}
      {status === "Error" && <ErrorIcon />}
    </span>
  );
}

function CleanIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none">
      <circle cx="9" cy="9" r="9" fill="var(--status-clean)" />
      <path
        d="M5.5 9.3L7.7 11.5L12.5 6.5"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DirtyIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none">
      <circle cx="9" cy="9" r="9" fill="var(--status-dirty)" />
      <rect x="8.25" y="4.5" width="1.5" height="5.5" rx="0.75" fill="#FFFFFF" />
      <circle cx="9" cy="12.5" r="1" fill="#FFFFFF" />
    </svg>
  );
}

function ConflictIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none">
      <path d="M9 1.6L16.8 15.4H1.2L9 1.6Z" fill="var(--status-alert)" />
      <rect x="8.3" y="6.4" width="1.4" height="4.6" rx="0.7" fill="#FFFFFF" />
      <circle cx="9" cy="12.6" r="0.95" fill="#FFFFFF" />
    </svg>
  );
}

function DetachedIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none">
      <circle cx="9" cy="9" r="9" fill="var(--status-detached)" />
      <rect x="5" y="8.25" width="8" height="1.5" rx="0.75" fill="#FFFFFF" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none">
      <circle cx="9" cy="9" r="9" fill="var(--status-alert)" />
      <path
        d="M6.2 6.2L11.8 11.8M11.8 6.2L6.2 11.8"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
