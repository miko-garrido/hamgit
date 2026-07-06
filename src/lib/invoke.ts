import type { ActionResult, RepositoryState } from "../types";

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

const MOCK_BRANCHES: Record<string, string[]> = {
  default: ["main", "develop", "feature/table-actions", "release/2.4", "fix/remote-parsing"],
};

let mockFolderCounter = 0;

async function mockInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await delay();

  switch (command) {
    case "inspect_repository": {
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
    case "list_branches": {
      return MOCK_BRANCHES.default as unknown as T;
    }
    case "pull_repository": {
      return { ok: true, message: "Already up to date." } as unknown as T;
    }
    case "switch_repository": {
      const branch = String(args?.branch ?? "main");
      return { ok: true, message: `Switched to branch '${branch}'` } as unknown as T;
    }
    case "open_in_vscode": {
      return { ok: true, message: "Opened in VS Code" } as unknown as T;
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
