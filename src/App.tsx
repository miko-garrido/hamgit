import { useRepos } from "./hooks/useRepos";
import { useSelection } from "./hooks/useSelection";
import { TitleBar } from "./components/TitleBar";
import { RepoTable } from "./components/RepoTable";
import { EmptyState } from "./components/EmptyState";

export function App() {
  const {
    rows,
    addRepositories,
    refreshFolders,
    sortColumn,
    sortDirection,
    toggleSort,
  } = useRepos();
  const { isSelected, toggle, handleRowClick } = useSelection();

  const isRefreshing = rows.some((row) => row.refreshing);
  const hasRepos = rows.length > 0;

  function onRowClick(folder: string, order: string[], event: React.MouseEvent) {
    handleRowClick(folder, order, { metaKey: event.metaKey, shiftKey: event.shiftKey });
  }

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar
        onAdd={addRepositories}
        onRefreshAll={() => refreshFolders(rows.map((row) => row.folder))}
        refreshDisabled={!hasRepos}
        refreshing={isRefreshing}
      />

      <section className="min-h-0 flex-1">
        {hasRepos ? (
          <RepoTable
            rows={rows}
            isSelected={isSelected}
            onToggle={toggle}
            onRowClick={onRowClick}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={toggleSort}
          />
        ) : (
          <EmptyState onAdd={addRepositories} />
        )}
      </section>
    </main>
  );
}
