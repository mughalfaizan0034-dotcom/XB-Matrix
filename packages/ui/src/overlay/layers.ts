/**
 * Canonical z-index layer system. Use these constants (or the matching
 * Tailwind `z-{n}` classes) rather than ad-hoc z values so layering is
 * predictable as overlays compose.
 *
 *   tooltip       9070   transient hover hints
 *   toast         9060   toast notifications
 *   dialog        9050   modal dialogs (and their backdrop)
 *   drawer        9050   side panels (same plane as dialogs)
 *   popover       9040   dropdown menus, comboboxes, date pickers
 *   header        30     sticky topbar / nav
 *   page chrome   20     in-page sticky chrome (Settings page header)
 *   table thead   10     sticky DataTable header cells
 *
 * Overlays render into a single portal root so we don't fight with
 * application-level stacking contexts at all.
 */

export const Z_LAYER = {
  popover: 9040,
  drawer: 9050,
  dialog: 9050,
  toast: 9060,
  tooltip: 9070,
} as const;

export type LayerName = keyof typeof Z_LAYER;
