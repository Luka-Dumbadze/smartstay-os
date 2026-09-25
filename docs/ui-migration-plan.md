# UI migration plan: Supabase Studio inspired Smartstay UI

## Scope and guardrails

This is a visual migration plan only. Keep API calls and payloads, authentication and authorization, database access, derived business rules, state ownership, and hash navigation behavior intact. Treat handlers and data-to-view calculations as fixed interfaces while changing the shell, styles, and presentational components.

There are two runnable frontends in this repository. The root Next.js app is the deployment target indicated by `vercel.json` (`framework: nextjs`) and is the primary scope below. `run.sh`, however, starts a separate Vite app at `apps/frontend/`, whose JSX components mirror much of the Next UI and whose theme is independent. Do not consolidate or change its framework as part of this design migration. If the `run.sh` console is still a supported user-facing product, schedule visual parity there as a separate follow-up; otherwise identify it as a demo/legacy surface.

Supabase inspiration should come from Studio’s compact developer-tool layout, semantic surface hierarchy, restrained borders, clear tables and page chrome, and themeable color roles. The official design-system docs describe CSS-backed semantic tokens and a consistent page structure built from page containers, optional breadcrumbs and page navigation, headers, and sections. This plan adapts those patterns locally; the repository does not currently install Supabase UI, Radix, or shadcn component packages. See [Supabase Design System](https://supabase.com/design-system), [Color Usage](https://supabase.com/design-system/docs/color-usage), [Tailwind Classes](https://supabase.com/design-system/docs/tailwind-classes), and [Layout patterns](https://supabase.com/design-system/docs/ui-patterns/layout).

## 1. Current frontend architecture

### Deployed Next.js app

- Next.js 16 App Router, React 19, strict TypeScript, and Tailwind CSS 3.4 with PostCSS; `lucide-react` supplies icons. There is no installed component library.
- The visible route is `/`, implemented by `app/(os)/page.tsx` inside the `(os)` route group. The server page handles Supabase configuration, auth, and staff membership, then renders `SignIn` or the client `OsShell`.
- Product sections are not separate App Router pages. `OsShell` owns the current view and reads/writes `window.location.hash`: `#/home`, `#/contact`, `#/crm`, `#/ops`, `#/drive`, `#/ai`, `#/analytics`, `#/builder`, and `#/store`. It listens for `hashchange`; views navigate through `actions.go`.
- `OsShell` also owns the shared snapshot load, Supabase Realtime subscription and polling fallback, notification/toast state, counts, and the common `OsContext`. Views receive that context and call its callbacks.
- `app/api/` contains Next route handlers for chat, knowledge search, room and task actions, Telegram webhooks, and cron. Those endpoints and their callers are outside this migration.

### Parallel Vite frontend

- `apps/frontend/` is Vite 8 + React 19 + Tailwind CSS 4, with a FastAPI proxy and separately maintained JSX versions of the shell and most views.
- `run.sh` starts this Vite console and `apps/backend/`; it does not start the root Next app. Its theme already has CSS variables and light/dark plus accent preferences, unlike the deployed Next app.
- This parallel implementation duplicates navigation, header, dock, app hub, contact center, CRM, operations, storage, and AI views. Styling it alongside Next would create duplicate implementation work and should be a separately scoped parity effort.

## 2. Current routing, shell, and navigation

`app/layout.tsx` imports `app/globals.css`, forces the `dark` class, and sets a dark viewport color scheme. `app/(os)/layout.tsx` provides a full-height, overflow-hidden viewport. `OsShell` then lays out a 72px icon rail, a content column with `Header` and a scrolling `<main>`, a fixed `BottomDock`, and overlay drawers/toasts.

`LeftRail` is hidden below the small breakpoint. It currently combines the product mark, live staff presence, workspace/Telegram/privacy/settings popovers, and the Mia launcher. The seven installed views are selected mainly through the bottom dock; the home view is an app grid. `Header` shows the current property and view title, live status/clock, notifications, and the signed-in user menu. Contact Center adds its own inner app/status navigation on wide screens.

Several view titles use `ViewTitle`, but crumb labels are locally supplied and not a shared route model. Page content uses a mixture of constrained (`max-w-6xl`) and full-width layouts. This means shell chrome, page width, section spacing, and title placement are good visual migration targets, while hash parsing and the `go` callback must remain stable.

## 3. Current design system and reusable UI

`tailwind.config.ts` defines fixed dark colors (`canvas`, `panel`, `card`, `fg`, `accent`), Inter/system and JetBrains Mono font stacks, and animation/shadow helpers. `app/globals.css` defines the global dark background and reusable `.card`, `.glass`, `.popover`, `.eyebrow`, `.icon-btn`, `.btn`, `.input`, `.pill`, and status-tone classes.

The visual language is currently dark, Apple-like, and decorative: black canvas, violet/blue radial glows, blue primary actions, gradients, translucent blurred surfaces, 12–24px corner radii, and animated hover/entry effects. Many views also bypass shared classes with inline Tailwind values and one-off colors/gradients, so changing only the existing aliases will not fully retheme the product.

`components/os/ui.tsx` is the main shared helper module. It currently mixes domain types and enums (`Snapshot`, `Task`, `ViewKey`, etc.), app metadata, formatting helpers, `Avatar`, `ViewTitle`, and `Empty`. It is reusable but not a clean visual-component layer. Common repeated patterns include page title/subtitle rows, bordered cards/panels, status pills, compact actions, filter/search rows, tables, empty states, detail drawers, and confirmation dialogs. `CrmView` and `AnalyticsView` both render tables; `ContactCenterView` and `OperationsView` both use multi-column work areas and status groupings.

## 4. Proposed Supabase-inspired architecture

Keep the existing Next route group, page, `OsShell` data/state flow, `OsContext`, feature-view ownership, API contracts, and hash values. Recompose the shell into a persistent, workspace-oriented dashboard frame:

1. A left navigation sidebar with a visible workspace identity block and grouped links for Overview, Guest service, Property operations, Knowledge, and AI/Insights. Preserve each existing `ViewKey` and call the same `actions.go` for selection. Do not introduce a new workspace switcher behavior; show the currently selected property as context.
2. A compact top bar for breadcrumb/page context, existing live/realtime status, notifications, and the current user menu.
3. A page container below the top bar with a consistent breadcrumb row, optional page-level sub-navigation, title/description block, action/filter placement, and section spacing. Use full-width containers for dense inbox/operations views and readable bounded widths for forms/details.
4. Responsive navigation that preserves access to all current views when the desktop sidebar is collapsed/hidden. Keep the current hash routing and mobile navigation destinations unchanged.
5. Keep Mia, staff presence, workspace tools, notifications, sign-out, and status indicators available, but relocate them into clear sidebar groups, profile/workspace menus, or drawers. Retain existing click handlers and data sources.

Use small local presentational components in the existing Next project rather than importing a second design system. Keep business rules and mutations in the feature views or shell. Extract a visual component only when it accepts display data and callbacks through props; it should not query Supabase, choose an API action, or decide a role/state transition.

Suggested organization (names are illustrative):

```text
components/os/
  layout/       OsShellFrame, WorkspaceSidebar, TopBar, PageContainer
  primitives/   Button, IconButton, Input, Badge, Card, DataTable, EmptyState
  patterns/     PageHeader, FilterBar, MetricCard, Dialog, Sheet
  ...           existing domain views and behavior
```

`OsShell` may render the new frame but should continue to own the same loading, realtime, routing, notification, and action behavior. Keep `components/os/ui.tsx` domain types and formatters available during migration; move visual helpers incrementally to avoid unrelated edits.

## 5. Design tokens to introduce

Define semantic CSS custom properties in `app/globals.css`, then map Tailwind utilities to those variables in `tailwind.config.ts`. Components should consume semantic roles rather than hard-coded palette colors. Keep dark as the initial and only active theme so this remains a visual migration; the variable structure can make a future theme possible without adding a theme toggle now.

| Token group | Proposed roles | Initial dark-mode direction |
| --- | --- | --- |
| App background | `--background`, `--background-alternative` | Neutral charcoal canvas; remove violet radial body glows. |
| Surfaces | `--surface-100`, `--surface-200`, `--surface-300`, `--surface-control`, `--surface-overlay` | Three subtly stepped neutral surfaces for page panels, raised menus, controls, and dialogs. |
| Text | `--foreground`, `--foreground-light`, `--foreground-lighter`, `--foreground-muted` | High-contrast white/gray hierarchy with muted metadata readable on dark surfaces. |
| Borders | `--border`, `--border-secondary`, `--border-control`, `--border-strong`, `--border-overlay` | Thin neutral separators; stronger borders for hover, focus, and selected rows. |
| Primary | `--primary`, `--primary-solid`, `--primary-bright`, `--primary-foreground`, `--ring` | Supabase-inspired green for actions and selected states; separate readable text/focus accent from the dark-mode button fill. |
| Status | `--success`, `--warning`, `--destructive`, `--info` and subtle backgrounds | Restrained semantic colors for task, AI, connection, and validation states; avoid using brand green as every status. |
| Typography | `--font-sans`, `--font-mono`, type-size and line-height steps | Retain the existing Inter/system stack and JetBrains Mono for identifiers, times, and technical metadata; use compact dashboard hierarchy. |
| Shape and depth | `--radius-control`, `--radius-card`, `--radius-overlay`, `--shadow-overlay` | Smaller, consistent radii and very limited shadow; remove frosted glass and decorative glow from ordinary panels. |
| Layout | `--sidebar-width`, `--sidebar-collapsed-width`, `--topbar-height`, page gutter/section gap | Shared shell geometry and spacing instead of repeating one-off width and padding values. |
| Data visualization | `--chart-1`…`--chart-n` | Stable categorical chart colors distinct from interaction accent tokens. |

For visual calibration only, a reasonable dark starter is canvas `#171717`, surfaces around `#1d1d1d`/`#242424`/`#2b2b2b`, foreground `#ededed`, muted text `#a0a0a0`, neutral borders around `#343434`, and a Supabase-green primary seed around `#3ecf8e`. These are proposed starting values, not a claim that they exactly match Supabase’s current production palette. Check contrast for text, selected states, controls, and focus rings before implementation. The reference system separates functional primary, brand, surface, foreground, and border roles; preserve that semantic split even if final values change.

## 6. Components to create or refactor

### Create as local presentational building blocks

- `PageContainer`, `Breadcrumbs`, `PageHeader`, and `PageSection` for shared content width, hierarchy, action placement, and section spacing.
- `Button` and `IconButton` variants, `Input`/search field, `Badge`/status indicator, `Card`/panel, `DataTable`, and `EmptyState` based on semantic tokens.
- `FilterBar`, `MetricCard`, and reusable `Dialog`/`Sheet` frame patterns for repeated view-level chrome. These components should receive labels, status tones, content, and callbacks as props.
- Shell pieces such as `WorkspaceSidebar`, grouped `NavItem`, `TopBar`, `WorkspaceContext`, and mobile navigation. These should receive existing state/actions from `OsShell`.

### Refactor visually, retaining behavior

- `app/globals.css` and `tailwind.config.ts`: add semantic token mappings and gradually replace hard-coded dark/blue/violet utilities. Keep compatibility classes while views migrate.
- `OsShell.tsx`, `LeftRail.tsx`, `Header.tsx`, and `BottomDock.tsx`: replace the icon-rail/floating-dock presentation with the dashboard frame, preserving hash navigation, badges, dialogs, user menu, notification callbacks, Mia, and presence.
- `ui.tsx`: retain domain definitions and formatters; adapt `ViewTitle`, `Empty`, and `Avatar` to the new primitives or replace their presentation behind the same props.
- Feature views: replace repeated page chrome, cards, table styles, status treatments, and overlay frames in place. Leave each view’s calculations, local interaction state, and action handlers intact.

## 7. High-risk components and boundaries

| Component | Risk | Why it needs a behavior-preserving visual pass |
| --- | --- | --- |
| `OsShell.tsx` | Very high | Central snapshot loading, realtime/polling, notifications, badges, toasts, `actions.post`, Mia drawer, and hash navigation are colocated with shell markup. Avoid restructuring effects or state while changing layout. |
| `ContactCenterView.tsx` / `ChatThread` | Very high | Conversation selection/status derivation, chapter filtering, transcript order, takeover/release, reply vs simulated guest message, AI reasoning links, and auto-scroll are interactive and live. Keep callbacks and message content mapping unchanged. |
| `OperationsView.tsx` | High | Task transitions use API actions and expected versions; room state changes and supervisor/attestation checks are business-sensitive. Only restyle controls/cards/modals. |
| `Header.tsx` / `LeftRail.tsx` | High | Navigation, mark-read/clear, sign-out, staff presence, refresh, and privacy/workspace information are embedded in menus/popovers. Relocation must preserve availability and handlers. |
| `CrmView.tsx` | Medium-high | Table filtering/sorting and profile drawer are mixed with guest data; creating and copying a Telegram deep link has an API side effect. Preserve this flow. |
| `DriveView.tsx` | Medium-high | Folder selection, document previews, and hybrid knowledge search call `/api/knowledge/search`; retain query/body and result behavior. |
| `AiTeamView.tsx` | Medium-high | Agent/session selection, live reasoning feed, citation display, and scroll behavior depend on current state and realtime data. Avoid flattening/removing detail. |
| `SignIn.tsx` | High | Auth sign-in/sign-up/sign-out and configuration/error modes are consequential. Restyle the form and states without changing Supabase calls. |
| `AppsGrid.tsx` | Medium | App navigation is straightforward, but the demo inquiry button sends a chat action. Keep its busy/error/toast flow. |

The safest refactor boundary is presentational: a component may own markup and token-based class names, but feature-level action selection, access checks, derived status logic, API payloads, data query logic, and state transitions stay where they are.

## 8. Recommended migration order and page batches

### Batch 0 — Pin the target

Use the root Next/Vercel path as the target documented here. Before any implementation, record whether `apps/frontend/` remains a supported product path; if it does, give it a separate parity backlog. Do not merge the two implementations as part of the UI work.

### Batch 1 — Tokens and primitive foundation

Introduce semantic variables and Tailwind aliases; create the shared button, input, badge, card, table, empty-state, page-header, and overlay patterns. Keep old class aliases during adoption so this batch can land without requiring all pages to move at once.

### Batch 2 — Shared shell and authentication

Restyle the root layout, `OsShell` frame, `LeftRail` navigation, `Header`, `BottomDock`/mobile navigation, and `SignIn`. Verify existing hash destinations, user/session menus, notification behavior, realtime indicator, unread/task badges, Mia quick chat, and auth states remain connected to their current handlers.

### Batch 3 — Low-risk overview and read-only analytics

- `AppsGrid` (`#/home`): app cards, welcome block, workspace summary, and existing simulate-inquiry action.
- `AnalyticsView` (`#/analytics`): metric cards, charts, and throughput table.

This batch exercises page containers, sections, metric cards, chart tokens, empty states, and tables without changing domain writes.

### Batch 4 — Data browsing and search

- `CrmView` (`#/crm`): guest table, filter/search controls, and profile detail sheet.
- `DriveView` (`#/drive`): folder/document browser, search results, and document preview.

Use the shared table/filter/sheet patterns. Preserve local selection/filter state and the Telegram-link and knowledge-search action flows.

### Batch 5 — Operational workflows

- `OperationsView` (`#/ops`): room readiness, task groups/cards, action buttons, and completion attestation dialog.

Use the new status, panel, and confirmation patterns; keep task-version checks, API bodies, and role-based availability exactly as they are.

### Batch 6 — Live messaging

- `ContactCenterView` (`#/contact`) and its reused `ChatThread` in the Mia drawer: inbox navigation, channel/state filters, conversation list, transcript, takeover state, composer, simulation controls, chapter selector, and evidence links.

Apply shared panel, filter, badge, input, and responsive column patterns. This is the highest interaction-density batch and should follow the shell and primitives.

### Batch 7 — AI activity and visual cleanup

- `AiTeamView` (`#/ai`): agent cards, reasoning feed, sessions list, citations, and status treatment.
- `NotInstalled` for `#/builder` and `#/store`, plus shell loading/error states, toast placement, and any remaining app overlays.
- Remove obsolete visual aliases only after all deployed Next views use semantic tokens. If Vite is still supported, implement a separately scoped presentation parity pass in `apps/frontend/` after the Next token choices stabilize.

## Migration boundary

The migration changes presentation and layout. It does not change App Router route definitions, the current hash route keys or route-selection behavior, Supabase auth/session handling, snapshot queries, Realtime subscriptions, polling, API endpoints/payloads, role or state rules, or database/backend behavior.
