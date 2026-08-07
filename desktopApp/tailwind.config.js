/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d10',
        surface: '#16161f',
        surface2: '#1f1f2e',
        surface3: '#272738',
        border: '#2d2d42',
        accent: '#6366f1',
        'accent-hover': '#818cf8',
        'accent-dim': 'rgba(99,102,241,0.15)',
        muted: '#888898',
        text: '#e8e8f0',
        'text-dim': '#b0b0c0',
        danger: '#ef4444',
        success: '#22c55e'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
