/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          canvas: 'rgb(var(--color-bg-canvas-rgb) / <alpha-value>)', // Whoop Slate Base Canvas (#13181C)
          bg: 'rgb(var(--color-bg-canvas-rgb) / <alpha-value>)',
          card: 'rgb(var(--color-bg-surface-rgb) / <alpha-value>)', // Whoop Slate Card (#2C3034)
          elevated: 'rgb(var(--color-bg-surface-raised-rgb) / <alpha-value>)', // Raised Surface (#3B4044)
          well: 'rgb(var(--color-bg-surface-subtle-rgb) / <alpha-value>)', // Recessed Well (#1E2429)
          input: 'rgb(var(--color-bg-surface-raised-rgb) / <alpha-value>)',
          hover: 'rgb(var(--color-bg-surface-control-rgb) / <alpha-value>)',
          subtle: 'rgb(var(--color-bg-surface-subtle-rgb) / <alpha-value>)',
          track: 'rgb(var(--color-bg-surface-control-rgb) / <alpha-value>)', // Control / Track (#474D50)
          border: 'var(--color-border-subtle)',
          'border-subtle': 'var(--color-border-subtle)',
        },
        brand: {
          primary: 'rgb(var(--color-accent-primary-rgb) / <alpha-value>)', // Whoop Mint (#00F19F)
          recovery: 'rgb(var(--color-accent-primary-rgb) / <alpha-value>)',
          strain: 'rgb(var(--color-status-info-rgb) / <alpha-value>)', // Telemetry Cyan (#4FC3D9)
          accent: 'rgb(var(--color-status-info-rgb) / <alpha-value>)',
          amber: 'rgb(var(--color-status-warning-rgb) / <alpha-value>)', // Caution Amber (#F5B94A)
          stress: 'rgb(var(--color-status-danger-rgb) / <alpha-value>)', // WCAG AA Danger Ink (#FF8A94)
          rose: 'rgb(var(--color-status-danger-fill-rgb) / <alpha-value>)', // Danger Fill (#FF3B4E)
          purple: 'rgb(var(--color-phase-hypertrophy-rgb) / <alpha-value>)', // Hypertrophy Violet (#8B7CF6)
          darktrack: 'rgb(var(--color-bg-surface-control-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',   // Concentric inner radius (3xl [26px] - p-5 [20px] = 6px)
        md: '8px',   // Concentric inner radius
        lg: '10px',  // Concentric inner radius (3xl [26px] - p-4 [16px] = 10px)
        xl: '14px',  // Concentric inner radius (2xl [20px] - p-1.5 [6px] = 14px)
        '2xl': '20px', // Secondary card / modal / elevated container
        '3xl': '26px', // Primary Biometric Luxury Card surface
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],      // Tier 1: 12px - Caption / Metadata / Label / Badge (Floor)
        sm: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0' }],       // Tier 2: 14px - Body / List Item / Button
        base: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],    // Tier 3: 16px - Subheading / Card Title / Input
        xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.02em' }],  // Tier 4: 20px - Hero Metric / Page Title / Gauge Value (Tight leading & tracking)
      },
    },
  },
  plugins: [],
}
