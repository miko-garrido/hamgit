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

export type RepoRow = RepositoryState & {
  /** False until the first inspect resolves; the row shows a loading state. */
  loaded: boolean;
  refreshing: boolean;
  acting: boolean;
  note: string | null;
};

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type SortColumn = "folder" | "repo" | "branch";
export type SortDirection = "asc" | "desc";
