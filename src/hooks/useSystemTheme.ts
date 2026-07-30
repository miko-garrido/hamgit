import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const DARK_MEDIA = "(prefers-color-scheme: dark)";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

function isDarkMode(): boolean {
  return window.matchMedia(DARK_MEDIA).matches;
}

function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);

  if (!isTauri()) return;

  try {
    void getCurrentWindow().setTheme(dark ? "dark" : "light");
  } catch {
    // Web / non-Tauri runtime
  }
}

let removeListener: (() => void) | null = null;

/** Apply OS appearance to `html.dark` and Tauri window chrome; subscribe to changes. */
export function applySystemTheme(): () => void {
  applyTheme(isDarkMode());

  if (!removeListener) {
    const mq = window.matchMedia(DARK_MEDIA);
    const onChange = (event: MediaQueryListEvent) => applyTheme(event.matches);
    mq.addEventListener("change", onChange);
    removeListener = () => {
      mq.removeEventListener("change", onChange);
      removeListener = null;
    };
  }

  return removeListener;
}

/** React hook that mirrors `applySystemTheme` with effect cleanup. */
export function useSystemTheme(): void {
  useEffect(() => applySystemTheme(), []);
}
