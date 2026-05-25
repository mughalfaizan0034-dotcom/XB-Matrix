# design-system

Enterprise operational platform, not consumer SaaS. Navy/orange theme. Lean, dense, action-first. See [frontend-standards](frontend-standards.md) for component conventions.

## 1. Semantic tokens (only allowed)

All colors come from `packages/ui` Tailwind preset + theme tokens. Forbidden: raw hex, raw `text-orange-*`, raw `bg-blue-*`, custom inline color styles.

Token categories:
- `bg-surface`, `bg-surface-elevated`, `bg-surface-muted`
- `text-foreground`, `text-muted`, `text-subtle`, `text-inverse`
- `border-default`, `border-muted`, `border-strong`
- `text-accent`, `bg-accent`, `bg-accent-soft`, `ring-accent`
- `text-success`, `text-warning`, `text-danger`, `text-info` (+ matching `bg-*-soft`)

## 2. Banned

- Raw Tailwind color utilities (`text-orange-500`, `bg-blue-50`, `#ffffff`, `rgb(...)`).
- Inline `style={{color}}` for theme-related color.
- Emoji in product UI.
- Em dashes in product copy (operator preference). Use commas / colons / parentheses.
- The word "omnichannel" in customer-facing copy.

## 3. Typography

| Use | Font | Notes |
|---|---|---|
| Headings | Quicksand | semibold; tracks tight on h1/h2 |
| Body | Inter | regular/medium |
| Numbers | Inter with `tabular-nums` | required on every KPI / table cell with metric |

Scale: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`. No arbitrary sizes.

## 4. Spacing scale

Tailwind spacing only: `1 / 2 / 3 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24`. No magic numbers. Grids in `gap-4` / `gap-6`. Module sections use `space-y-6` or `space-y-8`.

## 5. Elevation

| Token | Use |
|---|---|
| `shadow-none` | inline panels |
| `shadow-sm` | cards, KPI tiles |
| `shadow-md` | overlays, dropdowns |
| `shadow-lg` | dialogs, popovers |
| `shadow-xl` | drawers |

No custom shadows. Z-index ladder: base 0, sticky 10, dropdown 30, modal 50, toast 70.

## 6. KPI cards

- Fixed height per row (one row never mixes heights).
- Title (`text-sm text-muted`), value (`text-2xl tabular-nums`), delta (`text-xs` with `text-success` / `text-danger` + arrow glyph).
- Loading: skeleton block with same dimensions. No spinners inside cards.
- N/A state: dash glyph (`—`), never empty string.
- No business calculations on the client. Card receives engine output.

## 7. Charts (Recharts)

- Library: Recharts (locked).
- Colors via theme tokens (`--chart-1` … `--chart-6`). No raw hex.
- Tooltip: card surface, semantic-token border, `tabular-nums`.
- Axes: `text-xs text-muted`, grid `border-muted` dashed.
- Responsive container always wrapped. Min height 240px desktop, 200px mobile.
- Tick formatters in shared util (currency / compact number / percent).
- Aggregation server-side. Frontend renders the array.
- First chart: Dashboard revenue + spend trend.

## 8. Motion

| Use | Duration |
|---|---|
| Hover / press | 100ms |
| Surface transitions | 150ms |
| Dialog / drawer | 200ms |
| Skeleton pulse | 1200ms |

Easing: `ease-out` enter, `ease-in` exit. No bounce, no spring (enterprise tone).

## 9. Empty states

Two distinct patterns. Do not mix.

| Pattern | When | Look |
|---|---|---|
| `AwaitingData` | operational page, no data yet | dash glyph, "N/A" or "Awaiting Data", muted shell of the real layout |
| `ComingSoonState` | unfinished module | full-page premium primitive (see §10) |
| `AcademyEmptyState` | learning surfaces only | explanatory, prose-allowed |

**No "Upload your first CSV" CTAs** on operational module pages. Module pages render as a live platform shell with placeholder data.

## 10. ComingSoonState

Premium full-page primitive for modules not yet built. Product-anticipation moment, NOT a roadmap disclaimer. Rules:
- One per module, centered, full-bleed.
- No timeline, no version number, no "planned features" list.
- Headline + 1-line subhead + optional icon. Nothing else.
- Visually + tonally distinct from academy empty states.

## 11. Badge vocabulary

| Badge | Color token | Use |
|---|---|---|
| `Active` | success | live entity |
| `Suspended` | warning | paused org/user |
| `Archived` | muted | archived workspace/report |
| `Soft-deleted` | danger-soft | recycle bin item |
| `Coming soon` | accent-soft | placeholder modules (small inline only; full-page uses ComingSoonState) |
| `Beta` | info-soft | preview features |
| `Internal` | accent | internal-only surfaces |

Single shape: small pill, `text-xs`, `font-medium`, `px-2 py-0.5`, semantic border.

## 12. Module shell (every operational page)

```
Header → KPI Strip → Inner Tabs → Content
```

- Header: title + workspace context + primary action only.
- KPI strip: 3–6 cards, fixed row, server-computed values.
- Inner tabs: max 5; lazy-load tab content.
- No metadata walls, no speculative "planned" lists.

## 13. Settings module

Tabs: `Organization · Workspaces · Users · Warehouses · Forecast Rules · Upload Templates · Diagnostics`. Fixed order.

## 14. Sidebar / topbar

Sidebar items (in order): Dashboard · Sales · Inventory · Shipments · Advertisements · Forecasting · Unit Economics · Reports · Uploads · Insights · Settings. Module visibility driven by `useCan()` + workspace permissions — never raw role checks.

## 15. Accessibility floor

- All interactive elements: keyboard-focusable, visible `ring-accent` focus.
- Color contrast: WCAG AA on text + interactive states.
- Form fields: associated `<label>`, error in `text-danger` with `aria-describedby`.
- Charts: text alternative (table / aria-label summarizing trend).

## 16. Mobile

- Operational tables collapse to stacked cards under `md:`.
- Sidebar → drawer under `lg:`.
- KPI strip wraps to 2-up at `sm:`, 1-up below.
- No horizontal scroll on `<sm` except explicit data tables (with shadow indicators).

## Cross-refs

[frontend-standards](frontend-standards.md) · [engineering-rules](engineering-rules.md) · [qa-checklists](qa-checklists.md)
