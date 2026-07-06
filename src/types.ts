export type StatusLabel = "Clean" | "Dirty" | "Conflict" | "Detached" | "Error";

export type RemoteLabel =
  | "upToDate"
  | { ahead: number }
  | { behind: number }
  | { aheadBehind: { ahead: number; behind: number } }
  | "noUpstream"
  | "unknown";

export type RepositoryState = {
  folder: string;
  repo: string;
  branch: string | null;
  status: StatusLabel;
  remote: RemoteLabel;
  isDirty: boolean;
  hasConflicts: boolean;
  isDetached: boolean;
  error: string | null;
};

export type ActingVerb = "pull" | "push" | "sync" | "switch" | null;

export type RepoRow = RepositoryState & {
  /** False until the first inspect resolves; the row shows a loading state. */
  loaded: boolean;
  refreshing: boolean;
  acting: boolean;
  /** Which verb is in flight, so the remote/branch cell can render "Pulling…" etc. */
  actingVerb: ActingVerb;
  note: string | null;
};

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type BranchInfo = {
  name: string;
  lastCommitRelative: string;
  lastCommitUnix: number;
};

export type SortColumn = "folder" | "repo" | "branch";
export type SortDirection = "asc" | "desc";

/** Shared shape returned by bulk pull/push/sync so callers can build dialogs. */
export type BulkActionResult = {
  succeeded: string[];
  failed: { folder: string; repo: string; message: string }[];
  skipped: { folder: string; repo: string; reason: string }[];
};
