/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],      // Tier 1: 12px / 16px - Label / Caption / Pill / Segment
      base: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],    // Tier 2: 16px / 24px - Body / Interactive Control Floor (>= 16px)
      xl: ['1.25rem', { lineHeight: '1.5rem', letterSpacing: '-0.02em' }],   // Tier 3: 20px / 24px - Heading (120%) / Numeric Cell
      '3xl': ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],  // Tier 4: 32px / 36px - Hero KPI Display (2.67x span)
    },
    extend: {
      colors: {
        surface: {
          canvas: 'rgb(var(--color-bg-canvas-rgb) / <alpha-value>)', // Treise Slate Base Canvas (#13181C)
          bg: 'rgb(var(--color-bg-canvas-rgb) / <alpha-value>)',
          card: 'rgb(var(--color-bg-surface-rgb) / <alpha-value>)', // Treise Slate Card (#2C3034)
          elevated: 'rgb(var(--color-bg-surface-raised-rgb) / <alpha-value>)', // Raised Surface (#3B4044)
          well: 'rgb(var(--color-bg-canvas-rgb) / <alpha-value>)', // Recessed Well (#13181C)
          input: 'rgb(var(--color-bg-surface-raised-rgb) / <alpha-value>)',
          hover: 'rgb(var(--color-action-secondary-bg-rgb) / <alpha-value>)', // Interactive Secondary Control (#4B5156)
          subtle: 'rgb(var(--color-bg-surface-rgb) / <alpha-value>)',
          track: 'rgb(var(--color-bg-surface-control-rgb) / <alpha-value>)', // Static Control / Track (#3B4044)
          border: 'var(--color-border-subtle)',
          'border-subtle': 'var(--color-border-subtle)',
        },
        brand: {
          primary: 'rgb(var(--color-accent-primary-rgb) / <alpha-value>)', // Treise Mint (#1AE3A0)
          recovery: 'rgb(var(--color-accent-primary-rgb) / <alpha-value>)',
          strain: 'rgb(var(--color-status-info-rgb) / <alpha-value>)', // Non-progress telemetry Blue (#8FD3FF)
          amber: 'rgb(var(--color-status-warning-rgb) / <alpha-value>)', // Caution Amber (#F5B94A)
          copper: 'rgb(var(--color-coach-accent-rgb) / <alpha-value>)', // Coach Copper (#F29468)
          stress: 'rgb(var(--color-status-danger-rgb) / <alpha-value>)', // WCAG AA Danger Ink (#FF8A94)
          rose: 'rgb(var(--color-status-danger-fill-rgb) / <alpha-value>)', // Danger Fill (#FF3B4E)
          darktrack: 'rgb(var(--color-bg-surface-control-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
        mono: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '700',
        black: '700',
      },
      letterSpacing: {
        tightest: '-0.03em',
        wider: '0.06em',
        widest: '0.06em',
      },
      borderRadius: {
        sm: '4px',     // 4px micro badge / concentric tight inset
        md: '8px',     // Concentric inner radius (card [24px] - p-4 [16px] = 8px, tray [16px] - p-2 [8px] = 8px)
        lg: '12px',    // Control / CTA / segment inner radius (card [24px] - p-3 [12px] = 12px)
        xl: '16px',    // Segmented tray / sheet inner container (card [24px] - p-2 [8px] = 16px)
        '2xl': '20px', // Elevated modal / medium container (4px grid)
        '3xl': '24px', // Primary Treise Slate card / bottom sheet surface (4px grid)
      },
    },
  },
  plugins: [],
}
