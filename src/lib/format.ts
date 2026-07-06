import type { RemoteLabel } from "../types";

/** Best-effort home directory guess for the mock/browser environment. */
const HOME_GUESS = "/Users/miko";

/**
 * Render a folder path with `~` substituted for the home directory.
 * Falls back gracefully when no known home prefix matches.
 */
export function folderDisplay(folder: string, home: string = HOME_GUESS): string {
  if (home && folder.startsWith(home)) {
    const rest = folder.slice(home.length);
    return `~${rest}`;
  }
  return folder;
}

export function folderName(folder: string): string {
  const parts = folder.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}

/** Format the remote ahead/behind state per DESIGN.md arrow notation. */
export function remoteDisplay(remote: RemoteLabel): string {
  if (remote === "upToDate") return "Up to date";
  if (remote === "noUpstream") return "No upstream";
  if (remote === "unknown") return "Unknown";
  if ("ahead" in remote) return `↑ ${remote.ahead}`;
  if ("behind" in remote) return `↓ ${remote.behind}`;
  return `↑ ${remote.aheadBehind.ahead}, ↓ ${remote.aheadBehind.behind}`;
}

/** Full-word remote description for tooltips, e.g. "Ahead 1, behind 4". */
export function remoteTooltip(remote: RemoteLabel): string {
  if (remote === "upToDate") return "Up to date with the remote";
  if (remote === "noUpstream") return "No upstream branch configured";
  if (remote === "unknown") return "Remote state unknown";
  if ("ahead" in remote) return `Ahead ${remote.ahead}`;
  if ("behind" in remote) return `Behind ${remote.behind}`;
  return `Ahead ${remote.aheadBehind.ahead}, behind ${remote.aheadBehind.behind}`;
}

/** Parse "owner/repo" out of a git origin URL, for repo cell tooltips. */
export function ownerRepoFromOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const cleaned = origin.trim().replace(/\.git$/, "");
  const sshMatch = cleaned.match(/[:/]([^/:]+\/[^/]+)$/);
  return sshMatch ? sshMatch[1] : null;
}
