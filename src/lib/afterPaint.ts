/**
 * Yield until after a paint, or give up quickly when painting is suspended.
 *
 * Double-rAF alone hangs forever while the window is minimized/occluded
 * (WebKit suspends display-link callbacks). Race against a short timer and
 * skip entirely when the document is hidden.
 */
export function afterPaint(): Promise<void> {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 50);
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  });
}
