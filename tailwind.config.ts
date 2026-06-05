import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#080B12',
          1: '#0D1017',
          2: '#0F1220',
          3: '#141828',
          4: '#1A1F30',
        },
        purple: { DEFAULT: '#8B7FFE', dim: 'rgba(139,127,254,0.16)' },
        teal:   { DEFAULT: '#0FD98A', dim: 'rgba(15,217,138,0.14)' },
        amber:  { DEFAULT: '#FFAA2C', dim: 'rgba(255,170,44,0.13)' },
        coral:  { DEFAULT: '#FF5252', dim: 'rgba(255,82,82,0.12)' },
        blue:   { DEFAULT: '#42A5F5', dim: 'rgba(66,165,245,0.13)' },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Syne', 'DM Sans', 'sans-serif'],
      },
      borderRadius: {
        xl:  '12px',
        '2xl': '16px',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fadeUp 0.3s ease both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
