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
        void:    '#04060C',
        surface: {
          0: '#080B14',
          1: '#0C1019',
          2: '#10141F',
          3: '#151A28',
          4: '#1B2132',
        },
        accent: {
          violet: '#9B8AFF',
          cyan:   '#00E5C3',
          amber:  '#FFB547',
          rose:   '#FF6B81',
          blue:   '#5CA4FF',
        },
      },
      fontFamily: {
        body:    ['Outfit', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Syne', 'Outfit', 'sans-serif'],
      },
      borderRadius: {
        lg:   '10px',
        xl:   '14px',
        '2xl': '20px',
      },
      animation: {
        'pulse-slow':  'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up':     'fadeUp 0.3s ease both',
        'fade-in':     'fadeIn 0.2s ease both',
        'slide-right': 'slideRight 0.25s ease both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideRight: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
      boxShadow: {
        'node':  '0 4px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
        'panel': '0 8px 40px rgba(0,0,0,0.5)',
        'glow':  '0 0 30px rgba(0, 229, 195, 0.15), 0 0 60px rgba(0, 229, 195, 0.05)',
      },
    },
  },
  plugins: [],
}

export default config
