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
          bg: '#08090C',
          card: '#0E1116',
          elevated: '#171B22',
          hover: '#1D222B',
          subtle: '#12151B',
          track: '#181E27',
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
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '26px',
      },
    },
  },
  plugins: [],
}
