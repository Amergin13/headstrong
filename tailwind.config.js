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
          bg: '#060709',
          card: '#0D0F15',
          elevated: '#141720',
          hover: '#1B1F2C',
          border: 'rgba(255, 255, 255, 0.07)',
          'border-subtle': 'rgba(255, 255, 255, 0.04)',
        },
        brand: {
          primary: '#00F59B', // Kinetic Phosphor Lime/Emerald
          emerald: '#10B981',
          accent: '#00F0FF',  // Electric Biometric Cyan
          amber: '#F59E0B',   // Shield Amber
          rose: '#FF3366',    // Strain Rose
          purple: '#8B5CF6',
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
