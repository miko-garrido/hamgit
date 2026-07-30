import { useEffect, useRef } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, FolderMinus } from "lucide-react";

export type DialogVariant = "destructive" | "error" | "warning" | "message" | "partial";

export type DialogSpec = {
  variant: DialogVariant;
  title: string;
  body: string;
  /** Raw git stderr shown in a mono strip. Only used by the error variant. */
  detail?: string;
  /** Label for the confirm/primary action. Defaults per variant. */
  confirmLabel?: string;
  /** Label for the secondary/cancel action. Defaults per variant. */
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};

const BADGE_STYLES: Record<DialogVariant, string> = {
  destructive: "bg-red-50 text-red-700",
  error: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-900",
  message: "bg-emerald-50 text-emerald-800",
  partial: "bg-amber-50 text-amber-900",
};

function BadgeIcon({ variant }: { variant: DialogVariant }) {
  const className = "h-4 w-4";
  switch (variant) {
    case "destructive":
      return <FolderMinus className={className} />;
    case "error":
      return <AlertCircle className={className} />;
    case "warning":
      return <AlertTriangle className={className} />;
    case "message":
      return <CheckCircle className={className} />;
    case "partial":
      return <CheckCircle className={className} />;
  }
}

/**
 * Single-dialog system per DESIGN.md "Alerts & dialogs". Only one dialog is
 * shown at a time; callers own the queue (see useDialogs).
 */
export function Dialog({ spec, onDismiss }: { spec: DialogSpec; onDismiss: () => void }) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [spec]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        (spec.onCancel ?? onDismiss)();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [spec, onDismiss]);

  const isTwoAction = spec.variant === "destructive" || spec.variant === "error" || spec.variant === "warning";
  const cancelLabel = spec.cancelLabel ?? (spec.variant === "error" ? "Dismiss" : "Cancel");
  const confirmLabel = spec.confirmLabel ?? "OK";

  function handleCancel() {
    (spec.onCancel ?? onDismiss)();
  }

  function handleConfirm() {
    (spec.onConfirm ?? onDismiss)();
  }

  const confirmButtonClass =
    spec.variant === "destructive"
      ? "bg-red-700 text-background hover:bg-red-800"
      : "bg-foreground text-background hover:opacity-90";

  return (
    <div
      className="animate-dialog-scrim fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--scrim)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
    >
      <div className="animate-dialog-card w-[420px] rounded-2xl bg-surface p-5 shadow-dialog">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${BADGE_STYLES[spec.variant]}`}
          >
            <BadgeIcon variant={spec.variant} />
          </span>
          <h2 className="text-md font-semibold text-foreground">{spec.title}</h2>
        </div>

        <p className="mb-4 whitespace-pre-line text-sm leading-[19px] text-slate-500">{spec.body}</p>

        {spec.variant === "error" && spec.detail && (
          <div className="mb-4 rounded-md bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
            {spec.detail}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {isTwoAction && (
            <button
              type="button"
              onClick={handleCancel}
              className="h-8 rounded-md border border-border bg-surface px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={handleConfirm}
            className={`h-8 rounded-md px-3 text-sm font-medium ${confirmButtonClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
