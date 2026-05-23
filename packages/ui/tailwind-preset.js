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
        // xB Matrix brand
        navy: {
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
        },
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
        // semantic
        background: '#F8FAFC',
        foreground: '#0F172A',
        border: '#E2E8F0',
        input: '#E2E8F0',
        ring: '#0F2D4B',
        muted: { DEFAULT: '#F1F5F9', foreground: '#475569' },
        accent: { DEFAULT: '#F0691E', foreground: '#FFFFFF' },
        primary: { DEFAULT: '#0F2D4B', foreground: '#FFFFFF' },
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
