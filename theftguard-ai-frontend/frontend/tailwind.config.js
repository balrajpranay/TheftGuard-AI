/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F0F0F',
        gold: { DEFAULT: '#F4C430', deep: '#6B5400' },
        pale: '#FFF6D5',
        mist: '#F2F3F5',
        line: '#D6DAE0',
        muted: '#565B63',
        danger: '#B42318',
        ok: '#15803D',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '6px' },
    },
  },
  plugins: [],
}
