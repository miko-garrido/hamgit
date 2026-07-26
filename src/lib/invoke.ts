import type { ActionResult, BranchInfo, RepositoryState } from "../types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

function delay(min = 300, max = 800): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Seed data for the seven mock repos, covering every status/remote combination. */
const MOCK_REPOS: Record<string, RepositoryState> = {
  "/Users/miko/Projects/lucident-fullstack-workspace": {
    folder: "/Users/miko/Projects/lucident-fullstack-workspace",
    repo: "lucident-fullstack-workspace",
    branch: "main",
    status: "Clean",
    remote: "upToDate",
    isDirty: false,
    hasConflicts: false,
    isDetached: false,
    error: null,
  },
  "/Users/miko/Projects/hamgit-docs": {
    folder: "/Users/miko/Projects/hamgit-docs",
    repo: "hamgit-docs",
    branch: "main",
    status: "Clean",
    remote: { ahead: 2 },
    isDirty: false,
    hasConflicts: false,
    isDetached: false,
    error: null,
  },
  "/Users/miko/Projects/lucident-mobile": {
    folder: "/Users/miko/Projects/lucident-mobile",
    repo: "lucident-mobile",
    branch: "release/2.4",
    status: "Dirty",
    remote: { aheadBehind: { ahead: 1, behind: 4 } },
    isDirty: true,
    hasConflicts: false,
    isDetached: false,
    error: null,
  },
  "/Users/miko/Projects/dorxata-api": {
    folder: "/Users/miko/Projects/dorxata-api",
    repo: "dorxata-api",
    branch: "main",
    status: "Conflict",
    remote: { behind: 3 },
    isDirty: true,
    hasConflicts: true,
    isDetached: false,
    error: null,
  },
  "/Users/miko/Projects/eager-journey": {
    folder: "/Users/miko/Projects/eager-journey",
    repo: "eager-journey",
    branch: null,
    status: "Detached",
    remote: "noUpstream",
    isDirty: false,
    hasConflicts: false,
    isDetached: true,
    error: null,
  },
  "/Users/miko/Projects/paper-plugin-hamgit": {
    folder: "/Users/miko/Projects/paper-plugin-hamgit",
    repo: "paper-plugin-hamgit",
    branch: null,
    status: "Error",
    remote: "unknown",
    isDirty: false,
    hasConflicts: false,
    isDetached: false,
    error: "not a git repository",
  },
  "/Users/miko/Projects/hamgit": {
    folder: "/Users/miko/Projects/hamgit",
    repo: "hamgit",
    branch: "feature/table-actions",
    status: "Clean",
    remote: "unknown",
    isDirty: false,
    hasConflicts: false,
    isDetached: false,
    error: null,
  },
};

/** Recent-on-origin branches shown when the palette first opens. */
const MOCK_RECENT_BRANCHES: BranchInfo[] = [
  { name: "main", lastCommitRelative: "2h ago", lastCommitUnix: 0 },
  { name: "release/2.4", lastCommitRelative: "1d ago", lastCommitUnix: 0 },
  { name: "feature/push-notifications", lastCommitRelative: "3d ago", lastCommitUnix: 0 },
  { name: "fix/login-crash", lastCommitRelative: "5d ago", lastCommitUnix: 0 },
  { name: "chore/deps-bump", lastCommitRelative: "2w ago", lastCommitUnix: 0 },
];

/**
 * Larger hidden branch set searched by search_remote_branches, so the
 * auto origin search (and Enter retry) can surface branches absent from the
 * recents/mock cache (e.g. "fix/auth-retry"), and a query matching nothing
 * exercises the no-matches state.
 */
const MOCK_ALL_BRANCHES: BranchInfo[] = [
  ...MOCK_RECENT_BRANCHES,
  { name: "fix/auth-retry", lastCommitRelative: "4w ago", lastCommitUnix: 0 },
  { name: "fix/session-restore", lastCommitRelative: "3w ago", lastCommitUnix: 0 },
  { name: "feature/table-actions", lastCommitRelative: "6w ago", lastCommitUnix: 0 },
  { name: "develop", lastCommitRelative: "8w ago", lastCommitUnix: 0 },
  { name: "fix/remote-parsing", lastCommitRelative: "10w ago", lastCommitUnix: 0 },
];

let mockFolderCounter = 0;

/** Realistic git auth failure used to exercise the error-dialog path. */
const AUTH_ERROR = "fatal: could not read Username for 'https://github.com': terminal prompts disabled";

/** Repos whose pull/push always fail, to exercise error/partial dialogs in the mock. */
// hamgit is Clean (action-eligible), so its failure actually reaches the error
// dialog; dorxata-api is Conflict and only ever exercises the skip path.
const FAILING_FOLDERS = new Set([
  "/Users/miko/Projects/dorxata-api",
  "/Users/miko/Projects/hamgit",
]);

function aheadBehindOf(remote: RepositoryState["remote"]): { ahead: number; behind: number } {
  if (remote === "upToDate" || remote === "noUpstream" || remote === "unknown") {
    return { ahead: 0, behind: 0 };
  }
  if ("ahead" in remote) return { ahead: remote.ahead, behind: 0 };
  if ("behind" in remote) return { ahead: 0, behind: remote.behind };
  return { ahead: remote.aheadBehind.ahead, behind: remote.aheadBehind.behind };
}

function remoteFrom(ahead: number, behind: number): RepositoryState["remote"] {
  if (ahead === 0 && behind === 0) return "upToDate";
  if (ahead > 0 && behind === 0) return { ahead };
  if (ahead === 0 && behind > 0) return { behind };
  return { aheadBehind: { ahead, behind } };
}

async function mockInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await delay();

  switch (command) {
    case "inspect_repository":
    case "refresh_repository": {
      const folder = String(args?.folder ?? "");
      const seed = MOCK_REPOS[folder];
      if (seed) return { ...seed } as unknown as T;
      // Unknown folder: synthesize a plausible clean repo.
      const parts = folder.split("/").filter(Boolean);
      const name = parts[parts.length - 1] ?? folder;
      return {
        folder,
        repo: name,
        branch: "main",
        status: "Clean",
        remote: "upToDate",
        isDirty: false,
        hasConflicts: false,
        isDetached: false,
        error: null,
      } as unknown as T;
    }
    case "list_recent_branches": {
      return MOCK_RECENT_BRANCHES.map((branch) => ({ ...branch })) as unknown as T;
    }
    case "search_remote_branches": {
      const query = String(args?.query ?? "").toLowerCase();
      if (!query) return [] as unknown as T;
      return MOCK_ALL_BRANCHES.filter((branch) =>
        branch.name.toLowerCase().includes(query),
      ).map((branch) => ({ ...branch })) as unknown as T;
    }
    case "pull_repository": {
      const folder = String(args?.folder ?? "");
      if (FAILING_FOLDERS.has(folder)) {
        return { ok: false, message: AUTH_ERROR } as unknown as T;
      }
      const seed = MOCK_REPOS[folder];
      if (seed) {
        const { ahead, behind } = aheadBehindOf(seed.remote);
        seed.remote = remoteFrom(ahead, 0);
      }
      return { ok: true, message: "Already up to date." } as unknown as T;
    }
    case "push_repository": {
      const folder = String(args?.folder ?? "");
      if (FAILING_FOLDERS.has(folder)) {
        return { ok: false, message: AUTH_ERROR } as unknown as T;
      }
      const seed = MOCK_REPOS[folder];
      if (seed) {
        const { behind } = aheadBehindOf(seed.remote);
        seed.remote = remoteFrom(0, behind);
      }
      return { ok: true, message: "Pushed to origin." } as unknown as T;
    }
    case "switch_repository": {
      const folder = String(args?.folder ?? "");
      const branch = String(args?.branch ?? "main");
      if (branch === "fix/remote-parsing") {
        return {
          ok: false,
          message: "error: pathspec 'fix/remote-parsing' did not match any file(s) known to git",
        } as unknown as T;
      }
      const seed = MOCK_REPOS[folder];
      if (seed) {
        seed.branch = branch;
        seed.isDetached = false;
        seed.status = seed.hasConflicts ? "Conflict" : seed.isDirty ? "Dirty" : "Clean";
      }
      return { ok: true, message: `Switched to branch '${branch}'` } as unknown as T;
    }
    case "reveal_in_finder": {
      return { ok: true, message: "Revealed in Finder" } as unknown as T;
    }
    default:
      throw new Error(`Unknown mock command: ${command}`);
  }
}

/** Unified invoke: delegates to real Tauri when available, otherwise the mock. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke: realInvoke } = await import("@tauri-apps/api/core");
    return realInvoke<T>(command, args);
  }
  return mockInvoke<T>(command, args);
}

/** Directory picker: real Tauri dialog, or a mock that returns a fresh fake path. */
export async function pickDirectories(): Promise<string[]> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: true, title: "Add repositories" });
    return Array.isArray(selected) ? selected : selected ? [selected] : [];
  }

  await delay(200, 400);
  mockFolderCounter += 1;
  const names = ["new-project", "sandbox-app", "widgets-lib", "prototype-ui"];
  const name = names[(mockFolderCounter - 1) % names.length];
  const suffix = mockFolderCounter > names.length ? `-${mockFolderCounter}` : "";
  return [`/Users/miko/Projects/${name}${suffix}`];
}

export function listMockFolders(): string[] {
  return Object.keys(MOCK_REPOS);
}
