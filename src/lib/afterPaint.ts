/**
 * Yield until after the browser has painted at least once.
 * React 18 batches setState with the following await in the same tick, so busy
 * spinners set just before `invoke` often never flush. Double-rAF waits for the
 * style/layout commit that follows the state update.
 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
