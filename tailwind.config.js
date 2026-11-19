import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve content globs from this file's folder, not the process working directory. If the dev server is
// ever started from another directory (for example after a sandbox restart), Tailwind would otherwise find
// no files, emit no utility classes, and the whole layout would collapse.
const root = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: [path.join(root, 'index.html'), path.join(root, 'src/**/*.{js,ts,jsx,tsx}')],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        side: v('side'),
        card: v('card'),
        muted: v('muted-bg'),
        ink: v('ink'),
        'ink-2': v('ink-2'),
        dim: v('dim'),
        line: v('line'),
        accent: v('accent'),
        'accent-ink': v('accent-ink'),
        brand: v('brand'),
        brand2: v('brand-2'),
        good: v('good'),
        bad: v('bad'),
        warn: v('warn'),
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        glow: '0 0 0 1px rgb(var(--brand) / 0.35), 0 12px 40px -12px rgb(var(--brand) / 0.45)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
      animation: { float: 'float 8s ease-in-out infinite' },
    },
  },
  plugins: [],
}
