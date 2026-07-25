import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { DialogSpec } from "../components/Dialog";

type Show = (spec: DialogSpec) => void;
type Dismiss = () => void;

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

/** Delay so the updater never contends with first paint / initial inspect. */
const UPDATER_DELAY_MS = 2500;

/**
 * Checks GitHub Releases for a newer build on launch (packaged Tauri only).
 * Missing releases / offline failures stay silent. Scheduled after first paint
 * so the network check does not compete with the initial repo load.
 */
export function useAppUpdater(show: Show, dismiss: Dismiss) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current || import.meta.env.DEV || !isTauri()) return;
    started.current = true;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const update = await check();
          if (!update) return;

          const notes = update.body?.trim();
          show({
            variant: "warning",
            title: `Hamgit ${update.version} is available`,
            body: notes
              ? notes
              : "A new version is ready to install. Hamgit will restart after the update.",
            confirmLabel: "Install and restart",
            cancelLabel: "Later",
            onConfirm: () => {
              show({
                variant: "message",
                title: "Installing update…",
                body: "Hamgit will restart when the download finishes.",
                confirmLabel: "Please wait",
                onConfirm: () => {},
                onCancel: () => {},
              });

              void update
                .downloadAndInstall()
                .then(() => relaunch())
                .catch((error: unknown) => {
                  const detail = error instanceof Error ? error.message : String(error);
                  show({
                    variant: "error",
                    title: "Update failed",
                    body: "Couldn't install the update. Try again later, or download it from GitHub Releases.",
                    detail,
                    confirmLabel: "OK",
                    onConfirm: dismiss,
                    onCancel: dismiss,
                  });
                });
            },
            onCancel: dismiss,
          });
        } catch {
          // No published release yet, network issues, etc.
        }
      })();
    }, UPDATER_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      // Allow a remount (e.g. dep identity change) to schedule again.
      started.current = false;
    };
  }, [show, dismiss]);
}
