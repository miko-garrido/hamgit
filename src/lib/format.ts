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

/** Oxford-comma list: "A", "A and B", "A, B, and C". */
export function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Plain-language first line for the error dialog, derived from git stderr. */
export function errorSummary(verb: string, gitMessage: string): string {
  const lower = gitMessage.toLowerCase();
  if (lower.includes("could not read username") || lower.includes("authentication")) {
    return "origin rejected the request: authentication required. Check your credentials and try again.";
  }
  if (lower.includes("not possible to fast-forward") || lower.includes("divergent")) {
    return `The branch has diverged from its upstream, so a fast-forward ${verb} isn't possible. Resolve the divergence manually.`;
  }
  if (lower.includes("could not resolve host") || lower.includes("network")) {
    return "The remote could not be reached. Check your network connection and try again.";
  }
  if (lower.includes("rejected")) {
    return "The remote rejected the update. Pull the latest changes first, then try again.";
  }
  return `Git reported an error while trying to ${verb}. The full output is below.`;
}

/** Parse "owner/repo" out of a git origin URL, for repo cell tooltips. */
export function ownerRepoFromOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const cleaned = origin.trim().replace(/\.git$/, "");
  const sshMatch = cleaned.match(/[:/]([^/:]+\/[^/]+)$/);
  return sshMatch ? sshMatch[1] : null;
}
