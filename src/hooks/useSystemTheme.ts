const DARK_MEDIA = "(prefers-color-scheme: dark)";

function isDarkMode(): boolean {
  return window.matchMedia(DARK_MEDIA).matches;
}

function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
  // Do not call Tauri setTheme("dark"|"light") — that overrides system
  // following. Window chrome inherits macOS Appearance by default.
}

let removeListener: (() => void) | null = null;

/** Apply OS appearance to `html.dark`; subscribe to changes. */
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
