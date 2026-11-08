import type { Config } from 'tailwindcss'

// Colors live as CSS custom properties in app/globals.css (both themes); utilities reference them as
// `bg-[var(--surface)]`. Only the font stacks need a theme entry so `font-mono` / `font-sans` work.
const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}

export default config
