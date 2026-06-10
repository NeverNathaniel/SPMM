# Design: Desktop-only plan + live destination structure preview

Date: 2026-06-09
Status: implemented in the same session (autonomous run — interactive design
gates were not possible; decisions below follow the existing engine semantics
and codebase conventions).

## Goals

1. **Plan cleanup** — `DEVELOPMENT_WORKFLOW.md` (the application plan) still
   describes the retired FastAPI/React web stack. Rewrite it to describe the
   Electron desktop app only; remove every web/browser/server/non-desktop
   reference. The web prototype code at the repo root is *not* touched — only
   the plan document.
2. **Live destination structure preview** — in the SharePoint destinations
   panel, each site card must reflect the resulting folder structure under
   `Documents/` as mappings are added, changed, or removed: where mapped
   folder contents land, and where inherited child folders will be created.

## Background (engine semantics the preview must honor)

- An explicit mapping drops a local folder's **contents** into the target SP
  folder (the mapped folder itself does not become a new folder). Source:
  `mappingEngine.ts` rules 1–3 and the SPMT CSV (`Source → TargetSubFolder`).
- Every unmapped descendant inherits proportionally: local `AP\Invoices`
  mapped via `AP → Payroll` lands at `Payroll/Invoices` — a folder that will
  be **created by migration** and does not exist in `site.folders`.
- Explicit mappings always target existing SP folders ('' = Documents root):
  both drop targets and the destination picker only offer existing folders,
  and rename/delete keep mappings consistent (`spFolders.ts`).
- Skipped folders are omitted from the CSV; their exported descendants still
  create the intermediate path segments.

## Approaches considered

- **A (chosen): pure preview-tree builder in `src/shared/` + merged rendering
  in `SharePointPanel`.** A new `sitePreview.ts` merges a site's existing
  folder tree with the folders that migration will create (derived from
  resolved mappings), annotating each node with the local folders whose
  contents land there. The panel renders one merged tree; existing rows keep
  full interactivity, derived rows render as read-only "ghost" rows. Pure
  logic is unit-testable (repo convention: logic in `src/shared/`, no
  Node/DOM imports), and live updates come free via `useResolved()`.
- **B (rejected): a separate "incoming" list below each card.** Simpler, but
  fails the requirement — it would not show folders *nested* under their
  parents within `Documents/`.
- **C (rejected): compute the merge inline in the component.** Untestable and
  violates the shared-logic convention.

## Data model (`desktop/src/shared/sitePreview.ts`)

```ts
interface PreviewSource { localPath: string; localName: string; isExplicit: boolean }
interface PreviewNode {
  name: string;
  path: string;              // relative to Documents/
  existing: boolean;         // true = user-created SPFolder, false = created by migration
  folder: SPFolder | null;   // backing folder when existing
  sources: PreviewSource[];  // local folders whose contents land directly here
  children: PreviewNode[];
}
interface SitePreview { rootSources: PreviewSource[]; children: PreviewNode[] }
buildSitePreview(site: SharePointSite, resolved: ResolvedMapping[]): SitePreview
```

Rules:

- Consider only resolved mappings for this site with `skipped === false`
  (matches CSV output).
- Seed the tree from `site.folders` (existing nodes, original order), then for
  each mapping ensure its `spFolderPath` chain exists — creating ghost nodes
  as needed (case-insensitive name matching, like `addSpFolder`) — and attach
  the source at the final node (`''` → `rootSources`).
- Same path from several mappings merges into one node with several sources
  (exactly what SharePoint does — contents merge).
- A ghost node may have no sources of its own (pure intermediate segment when
  a midpoint folder was skipped but a descendant is exported).
- Child ordering: existing folders first in their original order, then ghost
  folders alphabetically (stable sort).

## UI (`SharePointPanel.tsx`)

- `SiteCard` consumes `useResolved()` and memoizes `buildSitePreview` per
  site, so the card recomputes on every mapping/skip/rename change — the
  "live" requirement.
- `SpFolderRow` now renders a `PreviewNode` (null = Documents/ root):
  - **Existing rows**: unchanged behavior — droppable, rename/delete context
    menu, `+ folder`, depth badges.
  - **Ghost rows**: read-only (no drop target, no menu, no `+ folder`),
    muted icon + italic name, a dashed `new` chip, tooltip naming the source
    local folder(s); a `merges N` chip when several sources collide. Depth
    shown muted with no warn/block icons (inherited rows are deeper by
    design and not re-blocked — mirrors `depthStatus` handling).
  - **Source chips** on existing rows and the Documents/ root: `⬅ <name>`
    per local folder whose contents land there (italic when inherited),
    tooltip = full local path.
  - Rows with children get an expand/collapse chevron (default expanded,
    component-local state, keyed by SP path so it survives rebuilds).

## Testing

- New `tests/sitePreview.test.ts` builds resolved mappings through the real
  `resolveMappings()` (no hand-built fixtures) and covers: no mappings;
  mapping to the Documents root; mapping to an existing folder; rule-3
  chain breaks landing in another site's preview; same-named children
  merging; skipped folders (leaf omitted / intermediate segment retained);
  inherited paths colliding with existing folders; ordering.
- UI verified by `npm test` + `npm run build` (tsc --noEmit + bundles).

## Docs kept in sync

- `desktop/README.md`: add `sitePreview.ts` to the layout listing and a key
  behaviour bullet for the live preview.
- `DEVELOPMENT_WORKFLOW.md`: full desktop rewrite per Goal 1, including the
  preview as a stated requirement of the destinations panel.
