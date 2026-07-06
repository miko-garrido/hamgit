import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  processing?: boolean;
  destructive?: boolean;
  size?: "standard" | "large";
};

/**
 * Standard icon button per DESIGN.md "icon-button-standard": circular,
 * borderless, 32px (36px in the selection bar). State is shade only.
 */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { icon: Icon, label, processing, destructive, size = "standard", className = "", disabled, ...rest },
  ref,
) {
  const dimension = size === "large" ? "h-9 w-9" : "h-8 w-8";
  const iconSize = "h-4 w-4";

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || processing}
      className={`group relative inline-flex ${dimension} items-center justify-center rounded-full border-0 bg-transparent text-slate-600 transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
        destructive ? "hover:bg-red-50" : "hover:bg-slate-100 active:bg-slate-200"
      } hover:text-slate-900 ${className}`}
      {...rest}
    >
      {processing ? (
        <Loader2 className={`${iconSize} animate-spin`} />
      ) : (
        <Icon className={iconSize} />
      )}
    </button>
  );
});
