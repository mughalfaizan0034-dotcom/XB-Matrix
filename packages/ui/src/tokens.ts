// Raw color literals. Components consume semantic Tailwind tokens
// (bg-accent, text-active, ring-accent, etc.) from tailwind-preset.js
// instead of these constants directly. These exist only for the rare
// places that need a runtime color string (canvas/SVG/embed). Keep
// the surface minimal so the semantic token layer stays canonical.
//
// Orange retired 2026-05-24 (project_design_system) — navy is the sole
// brand emphasis color.
export const COLOR_TOKENS = {
  navy: '#0F2D4B',
  background: '#F8FAFC',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;

export const FONT_FAMILIES = {
  heading: 'var(--font-quicksand), Quicksand, ui-sans-serif, system-ui, sans-serif',
  body: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
  numeric: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
} as const;
