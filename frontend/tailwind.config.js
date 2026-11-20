/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f7f5',
          100: '#e5ece7',
          200: '#cddbd1',
          300: '#a7c0b0',
          400: '#7a9f87',
          500: '#264836',
          600: '#1d382a',
          700: '#162821', // Primary Bistro Forest Green
          800: '#12221b',
          900: '#0d1914',
          950: '#070d0a',
        },
        bistro: {
          forest: '#162821',
          dark: '#111f19',
          cream: '#FAF9F4',
          sand: '#E8D2BD',
          sandHover: '#dec4ad',
          border: '#E8E6DF',
          muted: '#6B7B71',
          sage: '#A3B3A7',
          gold: '#B88D57',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
