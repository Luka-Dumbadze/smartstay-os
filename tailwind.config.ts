import type { Config } from 'tailwindcss'

/** Smartstay Web OS theme: dark canvas, frosted glass surfaces, Apple-style accents and motion. */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0c0c0e',
        panel: '#111113',
        card: '#1c1c1e',
        'card-hover': '#252528',
        elev: '#2a2a2e',
        line: 'rgba(255, 255, 255, 0.08)',
        fg: '#f5f5f7',
        'fg-2': '#a1a1a6',
        'fg-3': '#6e6e73',
        accent: '#0a84ff',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 48px -24px rgba(0,0,0,0.85)',
        dock: '0 24px 60px -18px rgba(0,0,0,0.9), 0 1px 0 0 rgba(255,255,255,0.08) inset',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(10px) scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { from: { opacity: '0', transform: 'scale(0.94) translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(28px)' }, to: { opacity: '1', transform: 'none' } },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        flash: { '0%': { boxShadow: '0 0 0 0 rgba(10,132,255,0.55)' }, '100%': { boxShadow: '0 0 0 14px rgba(10,132,255,0)' } },
      },
      animation: {
        rise: 'rise 380ms cubic-bezier(0.2,0.8,0.2,1) both',
        fade: 'fade 240ms ease-out both',
        pop: 'pop 260ms cubic-bezier(0.2,0.9,0.3,1.2) both',
        'slide-in': 'slide-in 320ms cubic-bezier(0.2,0.8,0.2,1) both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        flash: 'flash 1.4s ease-out',
      },
      transitionTimingFunction: { os: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    },
  },
  plugins: [],
}

export default config
