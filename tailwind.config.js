/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        totk: {
          dark: '#0e141b',
          surface: '#18222d',
          card: '#1f2d3d',
          gold: '#dfb76c',
          green: '#27e3a2',
          cyan: '#38e1ff',
          sky: '#61c3ff',
          depths: '#b558f6',
        }
      }
    },
  },
  plugins: [],
}
