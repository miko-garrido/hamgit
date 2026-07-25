# Hamgit Design Specification

Source of truth for the UI implementation. Reference screenshots live in `design/`
(exported from the Paper design file). When this document and a screenshot disagree,
the screenshot wins for visuals and this document wins for behavior.

Hamgit is a macOS Tauri app that tracks local git repositories: their branch, working-tree
status, and remote ahead/behind state, with pull / push / sync / switch-branch actions.

## Principles

1. **The table is the app.** One screen, no navigation. Every repo is a row; everything you can do, you do to rows.
2. **No toolbar.** Actions live in exactly three places: the title bar for global actions (add folders, refresh all), the right-click context menu for single-repo actions, and the floating selection bar for bulk actions.
3. **Branch switching is single-repo.** The branch palette works on one repo at a time. There is deliberately no bulk branch change.
4. **Read-mostly safety.** Hamgit reads constantly, writes only on request. Bulk actions skip unsafe repos (dirty, conflict, detached) instead of failing, and report partial success ("Pulled 5 of 7"). Remove only untracks a folder — nothing on disk is ever touched.
5. **Destructive means rose.** Dusty rose is reserved for destructive/failed things. Every destructive action gets a confirm dialog whose button restates the consequence ("Remove 2 folders"), never "Yes".
6. **State is shade, not lines.** Rows and buttons have no borders. Hover/pressed/selected are fills; boundaries come from geometry. Hairlines exist only on surfaces (menus, dialogs, inputs, pills).
7. **Color is meaning.** Sage = clean/success, apricot = dirty/caution, rose = conflict/error/destructive, slate = detached/neutral. One hue never carries two meanings.
8. **Progress happens in place.** In-flight work replaces the thing it affects (icon → spinner, remote cell → "Pulling…", branch cell → "Switching to…"). No global progress bars or blocking overlays. Auto-refresh is hardcoded at 30 seconds and never blocks interaction.
9. **Tooltips are labels.** 0.3s delay, dark pill, label only, no shortcuts. Below the element by default; above in the bottom selection bar.
10. **Native macOS, not themed.** Overlay title bar with real traffic-light metrics, system col-resize cursors, mono for paths/branches.

## Design tokens

Implement as CSS custom properties + Tailwind theme extension. See `design/design-tokens.png`.

### Colors

| Token | Value | Use |
|---|---|---|
| `background` | `hsl(0 0% 98%)` | app background |
| `surface` | `#FFFFFF` | cards, popovers, menus, bars, dialogs |
| `foreground` | `hsl(220 18% 13%)` | primary text |
| `border` | `hsl(214 18% 88%)` | hairlines on surfaces, input borders |
| `slate-50` | `#F8FAFC` | code-strip background |
| `slate-100` | `#F1F5F9` | icon-button/menu-item hover fill |
| `slate-200` | `#E2E8F0` | pressed fill |
| `slate-400` | `#94A3B8` | placeholder, faint icons |
| `slate-500` | `#64748B` | secondary text |
| `slate-600` | `#475569` | icon default |
| `slate-700` | `#334155` | secondary button text |
| `slate-800` | `#1E293B` | tooltip fill |
| `slate-900` | `#0F172A` | primary buttons, checked checkboxes |
| `row-hover` | `#F1F3F6` | row hover fill |
| `row-selected` | `#E5EAF2` | row selected fill |
| `status-clean` | `#79AC8F` | sage — clean status icon fill |
| `status-dirty` | `#D9A863` | apricot — dirty status icon fill |
| `status-alert` | `#C67F7F` | rose — conflict AND error icon fill |
| `status-detached` | `#98A4B5` | slate — detached icon fill |
| `emerald-50/200/800` | `#F0F6F2` / `#D3E5DA` / `#4E7A63` | success/message accents |
| `amber-50/200/900` | `#FAF6ED` / `#EEDFC0` / `#8A6F42` | warning accents |
| `red-50/200/700/800` | `#F9F1F1` / `#EBD5D5` / `#9C5F5F` / `#8F5454` | destructive/error (dusty rose) |

Allowed hardcoded values: macOS traffic-light colors, white glyph strokes inside filled
status icons and on dark buttons/tooltips, rgba() shadow/scrim values.

### Typography

Font: Inter (`font-sans`), fallback system-ui. Mono: SFMono-Regular/Menlo (`font-mono`)
for folder paths, branch names, and raw git output.

| Token | Size | Use |
|---|---|---|
| `2xs` | 11px | overlines, keyboard hints |
| `xs` | 12px | mono cells, tooltips, secondary text |
| `sm` | 13px | body, menu items, dialog copy, buttons |
| `base` | 14px | row primary text, inputs, palette rows |
| `md` | 15px | dialog titles |
| `lg` | 16px | app-level titles |

Weights: 400 body, 500 buttons/labels, 600 titles.

### Radii

5px menu items · 6px buttons/row fills/tooltips · 8px menus · 10px popovers · 12px dialogs · 999px icon buttons and pills.

### Shadows

Floating surfaces (menus, popovers, selection bar): `0 8px 24px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)`.
Dialogs and palette: `0 24px 64px rgba(15,23,42,0.2), 0 4px 12px rgba(15,23,42,0.08)`.

## Layout — main window (`design/app-main.png`)

- Window: 1180×760 default, min 860×520. `titleBarStyle: Overlay`, `hiddenTitle: true`, `trafficLightPosition {x:12,y:20}` (already configured in tauri.conf.json).
- **Title bar**: 52px tall, `data-tauri-drag-region`. Left: native traffic lights occupy the space (12px lights, 8px gaps, 20px inset — leave ~80px clear). Right: two icon buttons — folder-plus (add folders) and refresh (refresh all).
- **Table**: 16px horizontal padding from window edges. Column header row 32px: 13px medium slate-500, regular case ("Folder", "Repo ↑", "Branch", "Status", "Remote"), no background, no border. Sort indicator "↑" on the sorted column (default: Repo ascending). Hidden select-all checkbox slot (36px) keeps alignment.
- **Columns**: checkbox 36px fixed · Folder ~340px · Repo ~160px · Branch ~140px · Status ~120px · Remote flex. Fixed-width lanes, `flex-shrink: 0`, truncation with ellipsis. Columns are user-resizable (see Column resize).
- **Scrolling**: header and rows share a single scroll container (both axes) so they never desync — the header is `position: sticky; top: 0` inside that container, pinned vertically while scrolling horizontally with the columns. When the window is narrower than the columns' combined width, the table scrolls horizontally instead of truncating; Remote has a ~160px floor so it never collapses below its longest resting value ("Up to date" / "↑ 1, ↓ 4").
- **Rows**: 44px tall, no borders, no zebra. Folder in mono 12px with `~` substituted for the home dir (tooltip shows full path). Repo 14px medium. Branch mono 12px ("Detached" when detached, "-" when unknown). Status: 18px filled icon only (see Status icons). Remote: 12px, arrow notation — "Up to date", "↑ 2", "↓ 3", "↑ 1, ↓ 4", "No upstream", "Unknown".
- **Empty state** (`design/app-empty-state.png`): refresh icon button dimmed (opacity 0.4); centered 56px slate-100 circle with folder-plus icon, "No repositories yet" (15px semibold), body copy 13px slate-500 max 380px centered ("Add local folders to track branch, status, and remote state"), dark "Add folders" button. Hovering (or focusing) the button reveals a soft ASCII ripple field that expands from the button into the background — a one-screen welcome; the ripple is otherwise invisible. Honor `prefers-reduced-motion` with a static soft halo instead of traveling waves.

## Status icons

18px SVG, filled circle/triangle with white glyph, no text label. Tooltip gives name + meaning.

- **Clean**: sage circle + white check. Tooltip "Clean — nothing uncommitted".
- **Dirty**: apricot circle + white exclamation. Tooltip "Dirty — uncommitted changes".
- **Conflict**: rose triangle + white exclamation. Tooltip "Conflict — unresolved merge conflicts".
- **Detached**: slate circle + white minus. Tooltip "Detached — HEAD is not on a branch".
- **Error**: rose circle + white X. Tooltip "Error — <error message>".

## Row states & behavior (`design/row-behavior.png`, `design/row-interactions.png`)

- **Hover**: fill `row-hover`, 6px radius. Reveals the row checkbox (otherwise invisible; the 36px slot is always reserved).
- **Selected**: fill `row-selected`, checked checkbox (slate-900 rounded square, white check). Adjacent selected rows merge: outer corners of the run get 6px radius, inner shared edges are square, no gap. Different states never merge (hover pill stays separate from a touching selection).
- **Selection mechanics**: click checkbox toggles; ⌘-click row toggles; shift-click extends range. Selecting 1+ rows shows the selection bar.
- **Cell tooltips** (0.3s): folder → full unredacted path (mono); repo → `owner/repo` parsed from the origin URL; branch → full branch name only when truncated; status → name + meaning; remote → "Ahead 1, behind 4" in words. Remote cell is NOT clickable. Tooltips center horizontally on the pointer's x-position (clamped to the viewport, frozen once shown so they don't chase the cursor); keyboard focus (no pointer) falls back to anchor-centered.
- **In-flight**: any pull/push/sync replaces the remote cell with spinner + "Pulling…" / "Pushing…" / "Syncing…". Branch switch replaces the branch cell with spinner + "Switching to <branch>…". Resolves on the post-action refresh; errors surface via the error dialog and the status icon.

## Context menu (right-click on a row)

White surface, 1px border, 8px radius, floating shadow, 4px padding, 208px wide. Items 32px tall,
5px radius, 13px text, 15px leading icon, slate-100 hover fill. Order:

1. Refresh (refresh icon)
2. Pull (arrow-down)
3. Push (arrow-up)
4. Sync (arrow-up-down)
5. Switch branch (git-branch) → opens the branch palette
6. — divider —
7. Reveal in Finder (folder)
8. — divider —
9. Remove folder (folder-minus, rose text + icon) → destructive confirm dialog

While an item's action runs: its icon becomes the spinner, label goes present-tense ("Pulling…"),
conflicting items dim to 40%. Menu also includes "Open in VS Code"? — NO. That action was removed.

## Selection bar (`design/app-main.png` bottom)

Floating pill, bottom center, 24px above bottom edge. White surface, 1px border, 999px radius,
padding 6px 8px 6px 16px, floating shadow. Contents: "N selected" (14px medium) then 36px circular
icon buttons: refresh, pull (↓), push (↑), sync (↑↓), remove (folder-minus, rose) · divider (1×20px border color) · X (dismiss selection).
No branch switching in the bar. During a bulk action the running icon spins and the others dim to 40%.

## Icon buttons (`design/icon-button-standard.png`)

32×32 (36×36 in selection bar), circular, borderless. Default: 16px icon slate-600, no fill.
Hover: slate-100 fill, icon darkens to slate-900. Pressed: slate-200. Disabled: 40% opacity, no hover.
Processing: icon swaps to spinner (see Motion), button non-interactive. Destructive hover: red-50 fill.
Tooltips: 0.3s delay, slate-800 pill, 12px white label, 4px gap; below by default, ABOVE for the selection bar.
No re-delay when moving between adjacent buttons. Tooltips center on the pointer x-position, clamped
to the viewport (small anchors like these 32px buttons make this nearly indistinguishable from
anchor-centered); keyboard focus has no pointer and falls back to anchor-centered.

## Branch palette (`design/branch-palette.png`, `design/branch-switch-states.png`)

Opened from context menu → Switch branch. Command-palette style: dark scrim `rgba(30,41,59,0.18)`
+ backdrop blur ~6px over the whole window; 480px white card, 12px radius, dialog shadow, top-aligned
at ~160px from window top.

- **Header row** (48px, hairline below): search icon, input placeholder "Switch {repo} to branch…", `esc` key chip (11px, bordered 4px radius).
- **List**: overline "Recent on origin" (11px medium slate-400); rows 34px, 6px radius: git-branch icon, branch name 14px, relative time right-aligned 12px slate-400 (e.g. "2h ago"). Active/keyboard-focused row: slate-100 fill. Data: remote branches sorted by most recent commit date.
- **Footer** (36px, hairline above, slate-50 fill): "↑↓ navigate · ⏎ switch · type to filter" (11px slate-400).
- **Typing**: filters the cached branch list live; matched substring bold; count overline "N matches"; footer hint "Press ⏎ to search origin for more".
- **Enter (no local match focus)**: fetches from origin — spinner + "Searching origin for "{query}"…".
- **No matches**: "No branches match "{query}"" + "Checked local and origin · Esc to dismiss".
- **Select** (click or ⏎): closes palette, row's branch cell enters switching state. If the repo is dirty, show the Warning dialog first ("uncommitted changes… Switch anyway").

## Alerts & dialogs (`design/alerts-dialogs.png`)

420px card, 12px radius, 20px padding, dialog shadow, centered with the same scrim as the palette.
Anatomy: 32px circular icon badge + 15px semibold title on one line; 13px slate-500 body (19px leading);
right-aligned actions (32px tall, 6px radius, 13px medium).

- **Destructive** (remove folders): rose folder-minus badge on red-50; body names the folders and states they stay untouched on disk; Cancel (bordered surface) + rose-700 filled confirm that restates the action ("Remove 2 folders").
- **Error** (action failed): rose alert-circle badge; plain-language body; raw git stderr in a slate-50 mono 11px strip; Dismiss + dark "Retry <action>".
- **Warning** (risky but allowed): amber triangle badge; Cancel + dark confirm ("Switch anyway") — dark, not rose, because the action is legitimate.
- **Message** (info): sage check badge; single dark OK.
- **Partial success** (bulk with skips): amber circle-check badge; title "Pulled 5 of 7 repos"; body names skipped repos and why; single OK.

## Motion (`design/motion.png`)

Enter 120–200ms ease-out; exit ~120ms ease-in. Hover/pressed states are instant. Honor
`prefers-reduced-motion` by replacing movement with plain fades.

- **Dialogs**: scale 0.96→1 + fade, 180ms; scrim fades 150ms; exit reverse 120ms.
- **Palette**: translateY(-8px)→0 + fade, 160ms; blur/scrim ramp together; exit fade-only 120ms.
- **Selection bar**: translateY(16px)→0 + fade 200ms when selection goes 0→1; exits downward when cleared; count text crossfades 100ms; the bar does not re-animate while selection changes.
- **Spinners**: 360°/0.8s linear.
- **Tooltips**: no motion — appear/disappear instantly after the 0.3s delay.

## Column resize (`design/column-resize.png`)

~6px hit zone on header column boundaries. Hover: `cursor: col-resize` (system cursor — no custom
handle UI). Drag: 2px slate-400 guide line the full height of the table while dragging. Widths persist
in localStorage alongside the repo list.

## Behavior notes

- Repo list and column widths persist in localStorage (existing keys: `hamgit.repositories`).
- Auto-refresh: hardcoded 30s interval, skips repos with actions in flight.
  Refresh (manual + 30s) best-effort fetches remote refs (`git fetch --prune`)
  before re-inspecting so ahead/behind stay current; fetch failures stay silent
  (offline/auth still show local state). Post-action refreshes inspect only.
- Refresh concurrency 6; action concurrency 3 (as in the current code).
- Bulk pull/sync eligibility: skip dirty/conflict/detached/error repos, report partial success.
- Sync = pull (ff-only) then push; a pull failure aborts the push and reports the error.
- Sort: Repo ascending by default; clicking a column header sorts by it (toggle asc/desc, ↑/↓ indicator).
- Remove: never touches disk; confirm dialog always.
- macOS only for now (open/reveal commands use `open`).

## Dev/preview mock

The frontend must run in a plain browser (vite dev) without Tauri: when `window.__TAURI_INTERNALS__`
is absent, use a mock invoke layer with ~7 fake repos covering every status/remote state, fake
branch lists, and artificial latency (300–800ms) so processing states are visible. This is how the
UI is visually verified without launching the native shell.
