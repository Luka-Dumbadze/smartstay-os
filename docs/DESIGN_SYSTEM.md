# Smartstay product design system

This document defines the visual contract for Smartstay’s product UI. It takes cues from Supabase Studio’s dense developer-tool layout, semantic surface hierarchy, page structure, and restrained chrome. It does not use Supabase branding: do not use the Supabase logo, wordmark, product copy, or exact brand palette. The teal accent below is a Smartstay choice.

These are design specifications only. They do not implement pages, change routing, or change application behavior. The target app is the deployed Next.js frontend described in [the UI migration plan](ui-migration-plan.md); the separate Vite frontend can adopt these tokens in a separately scoped parity pass.

The reference system’s useful principles are semantic color roles, several purposeful surface levels, and consistent page containers, breadcrumbs, optional page navigation, headers, and sections. See the [Supabase Design System](https://supabase.com/design-system), [Color Usage](https://supabase.com/design-system/docs/color-usage), and [Layout patterns](https://supabase.com/design-system/docs/ui-patterns/layout). The names and values below are Smartstay-specific.

## Colors

Use CSS custom properties as the source of truth and map utilities to these semantic roles. The values below define the initial dark theme. Do not put raw palette values into component styles except for data visualizations that use their own named tokens.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| App background | `--color-app-bg` | `#101315` | Main viewport behind navigation and page content. |
| Sidebar background | `--color-sidebar-bg` | `#0D1012` | Persistent navigation surface, slightly darker than the app canvas. |
| Panel background | `--color-panel` | `#171B1D` | Cards, page sections, tables, and contained work areas. |
| Secondary panel | `--color-panel-secondary` | `#1C2123` | Nested panels, selected containers, table headers, and grouped content. |
| Elevated surface | `--color-elevated` | `#23292B` | Menus, popovers, tooltips, and raised controls. Dialogs use the panel background with an overlay. |
| Border | `--color-border` | `#2B3234` | Default panel and control separators. |
| Muted border | `--color-border-muted` | `#22282A` | Low-emphasis dividers and table row separators. |
| Primary text | `--color-text-primary` | `#E7ECEB` | Main labels, headings, and key values. |
| Secondary text | `--color-text-secondary` | `#B5BFBE` | Supporting copy and secondary labels. |
| Muted text | `--color-text-muted` | `#85908F` | Metadata, timestamps, hints, and inactive navigation. Maintain readable contrast. |
| Accent | `--color-accent` | `#63B8AD` | Smartstay teal for primary actions, links, selected states, and focus indicators. Pair solid fills with `--color-accent-foreground: #0C1917`. |
| Accent subtle | `--color-accent-subtle` | `rgb(99 184 173 / 12%)` | Quiet selected-row and selected-navigation backgrounds. |
| Destructive | `--color-destructive` | `#F0787C` | Destructive actions, failed states, and urgent errors. |
| Warning | `--color-warning` | `#E6B964` | Attention-needed and caution states. |
| Success | `--color-success` | `#79C79B` | Completed, healthy, and connected states. |

Also define `--color-overlay: rgb(0 0 0 / 56%)` and `--color-focus-ring: var(--color-accent)`. Use semantic status colors in both text/icon and a subtle background or border when the status needs emphasis; never communicate state by color alone. Validate contrast for actual text sizes and accent fills when these values are implemented.

## Layout

The application is a persistent dashboard shell with a fixed navigation column, compact top navigation, and independently scrolling page content. Let dense tools use available width; bound forms, summaries, and detail pages where a maximum width improves reading.

| Token | Value | Guidance |
| --- | --- | --- |
| `--layout-sidebar-width` | `248px` | Expanded desktop navigation width. |
| `--layout-sidebar-collapsed-width` | `56px` | Optional icon-only desktop state; keep labels available to assistive technology and in tooltips. |
| `--layout-top-nav-height` | `48px` | Compact top navigation row, including its border. |
| `--layout-content-max-width` | `1440px` | Default maximum for ordinary page content. Dense inboxes, operations boards, and wide tables may use the full available width. |
| `--layout-page-padding` | `24px` | Desktop page gutter; reduce to `16px` at tablet widths and `12px` on narrow screens. |
| `--layout-section-spacing` | `24px` | Vertical rhythm between major page sections; use `16px` for closely related groups. |
| `--layout-card-gap` | `12px` | Space between cards, table groups, and compact panels. |
| `--layout-card-padding` | `16px` | Default card interior padding; compact data panels may use `12px`. |

Use a consistent content column and align page title, filters, section edges, and tables to it. Put search and filter actions beside the list or table they control. On mobile, collapse the sidebar into an accessible menu and keep every current destination available.

## Component specifications

All components use the semantic color and layout tokens above. Shared components are presentational: they receive content, state labels, and callbacks from their caller and do not own product rules or API decisions.

| Component | Specification |
| --- | --- |
| **Button** | Compact 32px default height with 8px horizontal padding. Variants: primary, secondary, subtle/ghost, outline, and destructive. Use the accent for one clear primary action in a local context; support disabled, loading, hover, active, and visible keyboard-focus states. Avoid gradients and glow. |
| **Input** | 32px control height; panel/control fill, 1px border, 6px radius, clear placeholder, and a 2px focus ring with offset. Labels and validation messages sit outside the control. Reserve icons for meaningful affordances such as search or clear. |
| **Select** | Match Input height, border, radius, and focus behavior. Show the selected value and a quiet disclosure icon. The menu uses the elevated surface and a visible selected row. |
| **Textarea** | Match Input surface and focus states; default minimum height 88px and vertical resize where appropriate. Use proportional type for ordinary messages; use monospace only for technical values or code. |
| **Badge** | 20–22px high, compact horizontal padding, 6px radius, and short label. Neutral is the default; semantic status variants use restrained tinted backgrounds and readable text. Do not use badges as buttons unless their interactive state is explicit. |
| **Card** | Panel background, subtle 1px border, 8px radius, and 12–16px padding. Prefer a flat surface. Separate title, content, and footer with spacing or a muted divider instead of nested shadow layers. |
| **Table** | Dense data-first layout: 32px header and 36–40px rows, aligned numeric columns, clear column labels, subtle row separators, and a restrained hover/selected state. Keep actions in a predictable final column. On narrow screens, preserve access to fields with horizontal scrolling or a deliberate responsive layout. |
| **Tabs** | Compact text tabs in a single row. Indicate the active tab with accent text and a clear underline or low-contrast selected surface. Use a muted divider under the group; do not turn every tab into a saturated button. |
| **Dropdown** | Elevated surface with a 1px border, 6px radius, compact item heights, clear hover and selected states, and a subtle overlay shadow. Align to its trigger and keep menu actions keyboard reachable. |
| **Dialog** | Centered panel with a dim overlay, 1px border, 8px radius, and minimal shadow. Use a clear title, concise body, and aligned actions. Keep destructive confirmation visually distinct. |
| **Sheet** | Side panel for contextual details. Use a panel surface, separating border, fixed header/footer where useful, and an overlay that preserves context. On small screens, occupy the available width with a clear close action. |
| **Tooltip** | Small elevated surface with readable muted/primary text, subtle border, and no decorative arrow requirement. Use for supplemental labels and collapsed navigation; never make essential information tooltip-only. |
| **Breadcrumb** | Compact row above the page title. Ancestors are muted links, the current location is primary text, and separators are quiet. Keep the trail short and stable. |
| **EmptyState** | Small inline icon or illustration, concise title, one sentence of explanation, and an optional relevant action. Fit inside the affected panel; avoid oversized marketing-style empty screens. |
| **PageHeader** | Breadcrumb context first, then a compact title and optional description. Place page-level actions at the right when space allows; place search/filter actions beside their content instead. |
| **PageSection** | Groups related content with consistent vertical spacing and an optional title/description. Use a divider only when it improves scanning; avoid wrapping every section in another card. |
| **SidebarItem** | 32px row with a 16px icon, compact label, optional count badge, and clear hover/focus states. Active state uses a low-opacity accent fill and accent text or a narrow marker, never a full-bright sidebar block. Group related navigation under quiet section labels. |

## Style principles

- **Dense developer-tool interface:** prioritize useful information per viewport while preserving enough space to scan rows, groups, and controls.
- **Subtle borders:** use thin, low-contrast borders and separators to define panels. Save stronger borders for focused controls, selected rows, and important boundaries.
- **Restrained accent:** reserve the Smartstay teal for primary actions, links, active navigation, and focus. Most surfaces and secondary actions remain neutral.
- **Minimal shadows:** use a small shadow only when elevation clarifies a menu, dialog, or sheet. Ordinary cards remain flat and separated by surface and border.
- **Dark-first:** build against the defined dark palette. Keep colors semantic so another theme can be added later, but do not require theme switching in the initial implementation.
- **Strong information hierarchy:** use consistent size, weight, alignment, and muted metadata. Titles, values, status, and supporting text should be distinguishable without relying on decoration.
- **Compact controls:** buttons, inputs, selects, tabs, and navigation rows use a shared compact baseline. Give touch targets more room on narrow/mobile layouts without inflating desktop density.
- **Purposeful typography:** use the sans-serif UI face for product copy and data labels. Use monospace only for technically meaningful content such as IDs, timestamps when precision matters, model names, token counts, and code.
- **No borrowed identity:** do not reproduce Supabase marks, wordmark, signature green, slogans, or branded component illustrations. The influence is the dashboard structure and interface discipline; Smartstay keeps its own identity.
- **Accessible states:** preserve visible keyboard focus, readable contrast, disabled/loading feedback, and text or icon labels alongside semantic colors.
