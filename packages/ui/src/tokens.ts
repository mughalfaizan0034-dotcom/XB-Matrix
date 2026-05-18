export const COLOR_TOKENS = {
  navy: '#0F2D4B',
  orange: '#F0691E',
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
