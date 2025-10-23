/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'cravora-purple': '#9341d8',
        'cravora-purple-light': '#a855f7',
        'cravora-purple-dark': '#7c3aed',
      },
    },
  },
  plugins: [],
};
