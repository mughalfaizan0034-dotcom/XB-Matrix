// xB Matrix navy scale, lifted to a const so semantic tokens can
// alias the same shades without restating them. Single source of
// truth for the brand structural color.
const navy = {
  DEFAULT: '#0F2D4B',
  50: '#F1F5FA',
  100: '#DCE6F0',
  200: '#B6CADC',
  300: '#86A7C2',
  400: '#5683A6',
  500: '#33648A',
  600: '#1F4A6C',
  700: '#163A56',
  800: '#0F2D4B',
  900: '#0A2038',
  950: '#061425',
};

// Semantic tokens (project_design_system 2026-05-24).
// Components MUST consume these by meaning, not by raw color name.
//   accent       — brand emphasis (primary CTAs, headline chart series)
//   active       — selected / live indicator (sidebar row, unread badge)
//   attention    — "look here" highlight (new pill, fresh-row marker)
//   construction — unfinished module accent (ComingSoonState pieces)
//   warning      — non-blocking caution (amber-mapped, status signal)
//
// The four brand-emphasis tokens (accent/active/attention/construction)
// all map to navy today; a future palette pivot changes the mapping
// here and consumers do not change. Warning is its own semantic and
// keeps amber values since it's a status signal, not brand.
const semantic = (foregroundColor = '#FFFFFF') => ({
  ...navy,
  foreground: foregroundColor,
});

// Warning scale (amber, status semantic). Lifted as a const so the
// CI guard can ban raw `amber-*` utility usage in app code while the
// semantic `warning` token still resolves to amber values.
const warningScale = {
  DEFAULT: '#D97706',
  foreground: '#FFFFFF',
  50: '#FFFBEB',
  100: '#FEF3C7',
  200: '#FDE68A',
  300: '#FCD34D',
  400: '#FBBF24',
  500: '#F59E0B',
  600: '#D97706',
  700: '#B45309',
  800: '#92400E',
  900: '#78350F',
  950: '#451A03',
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Structural brand palette
        navy,
        // Orange palette retained for backward-compat during the
        // orange-removal sweep. Consumers in apps/web/src still
        // reference `bg-orange-*` / `text-orange-*` utility classes
        // and migrate to semantic tokens in the follow-up PR. The
        // palette is dropped (and a CI guard added) in PR-C.
        orange: {
          DEFAULT: '#F0691E',
          50: '#FFF4ED',
          100: '#FFE4D2',
          200: '#FFC59E',
          300: '#FFA169',
          400: '#FA8345',
          500: '#F0691E',
          600: '#D1500A',
          700: '#A93F08',
          800: '#7F3206',
          900: '#582203',
          950: '#321301',
        },
        // Foundation tokens (chrome / typography / surfaces)
        background: '#F8FAFC',
        foreground: '#0F172A',
        border: '#E2E8F0',
        input: '#E2E8F0',
        // Focus ring is the brand emphasis color (navy). Every
        // focusable element inherits this without restating it.
        ring: navy.DEFAULT,
        muted: { DEFAULT: '#F1F5F9', foreground: '#475569' },
        // Semantic brand-emphasis tokens — all map to navy today.
        // The orange-emphasis era is over (per user direction
        // 2026-05-24 — felt forced against operational data).
        accent: semantic(),
        active: semantic(),
        attention: semantic(),
        construction: semantic(),
        // Warning is its own semantic (amber). Consumers use
        // bg-warning-100 / text-warning-700 etc. instead of raw amber.
        warning: warningScale,
        primary: { DEFAULT: navy.DEFAULT, foreground: '#FFFFFF' },
        secondary: { DEFAULT: '#E2E8F0', foreground: '#0F172A' },
        destructive: { DEFAULT: '#DC2626', foreground: '#FFFFFF' },
        card: { DEFAULT: '#FFFFFF', foreground: '#0F172A' },
        popover: { DEFAULT: '#FFFFFF', foreground: '#0F172A' },
      },
      fontFamily: {
        heading: ['var(--font-quicksand)', 'Quicksand', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        numeric: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
      boxShadow: {
        'xb-sm': '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03)',
        'xb-md': '0 4px 8px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04)',
        'xb-lg': '0 12px 24px rgba(15, 23, 42, 0.08), 0 4px 8px rgba(15, 23, 42, 0.04)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        // Skeleton sweep used by transitional-state primitives.
        // Soft gradient slides left to right across the placeholder;
        // intentionally subtle, never flashy.
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
