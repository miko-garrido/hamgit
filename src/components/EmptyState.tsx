import { FolderPlus } from "lucide-react";

type Props = {
  onAdd: () => void;
};

/** Centered empty state per DESIGN.md / design/app-empty-state.png. */
export function EmptyState({ onAdd }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <FolderPlus className="h-6 w-6 text-slate-600" />
      </div>
      <h2 className="mb-2 text-md font-semibold text-foreground">No repositories yet</h2>
      <p className="mb-5 max-w-[380px] text-sm text-slate-500">
        Add local folders to track their branch, status, and remote state. Hamgit only reads
        your repos — nothing runs without you asking.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
      >
        <FolderPlus className="h-4 w-4" />
        Add folders
      </button>
    </div>
  );
}
