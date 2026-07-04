/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,js}'],
  theme: {
    extend: {
      // Colors resolve to CSS variables (defined in src/styles.css) so the
      // Signal palette has ONE source of truth shared by DOM + Three.js.
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg)',
          surface: 'var(--color-surface)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          muted: 'var(--color-text-muted)',
        },
        state: {
          waiting: 'var(--color-waiting)',
          ready: 'var(--color-ready)',
          false: 'var(--color-false-start)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
