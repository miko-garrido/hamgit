import { useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, Loader2, Search } from "lucide-react";
import { afterPaint } from "../lib/afterPaint";
import { invoke } from "../lib/invoke";
import type { BranchInfo } from "../types";

type Props = {
  repo: string;
  folder: string;
  currentBranch: string | null;
  onSelect: (branch: string) => void;
  onClose: () => void;
};

type Phase = "loading" | "idle" | "searching" | "no-matches";

/**
 * Command-palette style branch switcher per DESIGN.md "Branch palette".
 * Opens with recent-on-origin branches, filters locally while typing, and
 * falls through to a live origin search on Enter when nothing is focused.
 */
export function BranchPalette({ repo, folder, currentBranch, onSelect, onClose }: Props) {
  const [recents, setRecents] = useState<BranchInfo[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BranchInfo[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    invoke<BranchInfo[]>("list_recent_branches", { folder })
      .then((branches) => {
        if (cancelled) return;
        setRecents(branches);
        setPhase("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setRecents([]);
        setPhase("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [folder]);

  const filtered = useMemo(() => {
    const source = searchResults ?? recents;
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [searchResults, recents, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, searchResults]);

  useEffect(() => {
    // Typing again after a completed search invalidates the stale result set.
    setSearchResults(null);
    if (phase === "no-matches") setPhase("idle");
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runSearch(searchQuery: string) {
    const id = ++requestId.current;
    setPhase("searching");
    await afterPaint();
    try {
      const results = await invoke<BranchInfo[]>("search_remote_branches", {
        folder,
        query: searchQuery,
      });
      if (id !== requestId.current) return;
      setSearchResults(results);
      setPhase(results.length === 0 ? "no-matches" : "idle");
    } catch {
      if (id !== requestId.current) return;
      setSearchResults([]);
      setPhase("no-matches");
    }
  }

  function selectBranch(branch: string) {
    if (branch === currentBranch) {
      onClose();
      return;
    }
    onSelect(branch);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((index) => (index + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = query.trim();
      if (filtered.length > 0 && activeIndex < filtered.length) {
        selectBranch(filtered[activeIndex].name);
        return;
      }
      if (trimmed && phase !== "searching") {
        void runSearch(trimmed);
      }
    }
  }

  const overline =
    phase === "idle" && searchResults
      ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} on origin`
      : phase === "idle" && query.trim()
        ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}`
        : "Recent on origin";

  const footerHint =
    phase === "idle" && query.trim() && !searchResults
      ? 'Press ⏎ to search origin for more'
      : "↑↓ navigate · ⏎ switch · type to filter";

  return (
    <div
      className="animate-palette-scrim fixed inset-0 z-50 flex justify-center"
      style={{ backgroundColor: "rgba(30,41,59,0.18)", backdropFilter: "blur(6px)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="animate-palette-card mt-[160px] h-fit w-[480px] rounded-2xl bg-surface shadow-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Switch ${repo} to branch…`}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-slate-400 focus:outline-none"
          />
          <span className="shrink-0 rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] text-slate-500">
            esc
          </span>
        </div>

        <div className="max-h-[360px] overflow-auto p-2">
          {phase === "loading" && (
            <div className="flex h-9 items-center gap-2 px-2 text-sm text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading branches…
            </div>
          )}

          {phase === "searching" && (
            <div className="flex h-9 items-center gap-2 px-2 text-sm text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching origin for &quot;{query.trim()}&quot;…
            </div>
          )}

          {phase === "no-matches" && (
            <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
              <p className="text-sm text-foreground">
                No branches match &quot;{query.trim()}&quot;
              </p>
              <p className="text-xs text-slate-500">Checked local and origin · Esc to dismiss</p>
            </div>
          )}

          {phase === "idle" && (
            <>
              <div className="px-2 pb-1 pt-1 text-[11px] font-medium text-slate-400">
                {overline}
              </div>
              {filtered.map((branch, index) => (
                <BranchRow
                  key={branch.name}
                  branch={branch}
                  query={query.trim()}
                  isCurrent={branch.name === currentBranch}
                  isActive={index === activeIndex}
                  onHover={() => setActiveIndex(index)}
                  onClick={() => selectBranch(branch.name)}
                />
              ))}
            </>
          )}
        </div>

        <div className="flex h-9 items-center rounded-b-2xl border-t border-border bg-slate-50 px-3 text-[11px] text-slate-400">
          {footerHint}
        </div>
      </div>
    </div>
  );
}

function BranchRow({
  branch,
  query,
  isCurrent,
  isActive,
  onHover,
  onClick,
}: {
  branch: BranchInfo;
  query: string;
  isCurrent: boolean;
  isActive: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onClick}
      className={`flex h-[34px] w-full items-center gap-2 rounded-md px-2 text-left transition-colors ${
        isActive ? "bg-slate-100" : ""
      }`}
    >
      <GitBranch className="h-[15px] w-[15px] shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1 truncate text-base text-foreground">
        <HighlightedName name={branch.name} query={query} />
        {isCurrent && <span className="ml-1.5 text-xs text-slate-400">current</span>}
      </span>
      <span className="shrink-0 text-xs text-slate-400">{branch.lastCommitRelative}</span>
    </button>
  );
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerName.indexOf(lowerQuery);
  if (index === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, index)}
      <strong className="font-semibold">{name.slice(index, index + query.length)}</strong>
      {name.slice(index + query.length)}
    </>
  );
}
