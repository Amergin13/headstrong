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
          canvas: '#060709', // Obsidian Base Canvas
          bg: '#060709',     // Alias for canvas
          card: '#0E1219',   // Biometric Luxury Card (Whoop 4.0 dark slate)
          elevated: '#141824', // Elevated Sub-Panel / Inset Group
          well: '#090C12',   // Dark Inset Well / Mode Switcher Group
          input: '#0B0E14',  // Stepper Input / Text Field Inset
          hover: '#1A2030',  // Subtle surface hover
          subtle: '#12151B',
          track: '#171B24',  // Dark gauge & progress background track
          border: 'rgba(255, 255, 255, 0.08)',
          'border-subtle': 'rgba(255, 255, 255, 0.05)',
        },
        brand: {
          primary: '#00F59B', // Kinetic Recovery Lime/Emerald
          recovery: '#00F59B', // Whoop Electric Recovery Green
          strain: '#00B2FF',   // Whoop Electric Strain Blue/Cyan
          accent: '#00E5FF',   // Electric Cyan
          amber: '#FFB800',    // Biometric Amber / Moderate
          stress: '#FF5C5C',   // Stress Monitor Red / Elevated
          rose: '#FF3366',     // Strain Rose
          purple: '#A855F7',   // ECG / Hormonal Purple
          darktrack: '#181E27', // Dark gauge background track
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
