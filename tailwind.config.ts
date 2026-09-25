import type { Config } from 'tailwindcss'

/** Smartstay semantic tokens plus compatibility names used by the existing views. */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg': 'rgb(var(--color-app-bg-rgb) / <alpha-value>)',
        'sidebar-bg': 'rgb(var(--color-sidebar-bg-rgb) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-panel-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--color-panel-secondary-rgb) / <alpha-value>)',
        },
        elevated: 'rgb(var(--color-elevated-rgb) / <alpha-value>)',
        control: 'rgb(var(--color-control-rgb) / <alpha-value>)',
        foreground: {
          DEFAULT: 'rgb(var(--color-text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border-rgb) / <alpha-value>)',
          muted: 'rgb(var(--color-border-muted-rgb) / <alpha-value>)',
          strong: 'rgb(var(--color-border-strong-rgb) / <alpha-value>)',
        },
        accent: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
        'accent-subtle': 'var(--color-accent-subtle)',
        'accent-foreground': 'rgb(var(--color-accent-foreground-rgb) / <alpha-value>)',
        destructive: 'rgb(var(--color-destructive-rgb) / <alpha-value>)',
        warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
        success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        overlay: 'var(--color-overlay)',

        // Compatibility aliases remain available while existing views migrate.
        canvas: 'rgb(var(--color-app-bg-rgb) / <alpha-value>)',
        panel: 'rgb(var(--color-sidebar-bg-rgb) / <alpha-value>)',
        card: 'rgb(var(--color-panel-rgb) / <alpha-value>)',
        'card-hover': 'rgb(var(--color-panel-secondary-rgb) / <alpha-value>)',
        elev: 'rgb(var(--color-elevated-rgb) / <alpha-value>)',
        line: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        fg: 'rgb(var(--color-text-primary-rgb) / <alpha-value>)',
        'fg-2': 'rgb(var(--color-text-secondary-rgb) / <alpha-value>)',
        'fg-3': 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      spacing: {
        page: 'var(--layout-page-padding)',
        section: 'var(--layout-section-spacing)',
        'section-related': 'var(--layout-section-spacing-related)',
        'card-gap': 'var(--layout-card-gap)',
        card: 'var(--layout-card-padding)',
        'card-compact': 'var(--layout-card-padding-compact)',
      },
      width: {
        sidebar: 'var(--layout-sidebar-width)',
        'sidebar-collapsed': 'var(--layout-sidebar-collapsed-width)',
      },
      height: { 'top-nav': 'var(--layout-top-nav-height)' },
      maxWidth: { 'page-content': 'var(--layout-content-max-width)' },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        overlay: 'var(--radius-overlay)',
      },
      ringColor: { focus: 'var(--color-focus-ring)' },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 48px -24px rgba(0,0,0,0.85)',
        dock: '0 24px 60px -18px rgba(0,0,0,0.9), 0 1px 0 0 rgba(255,255,255,0.08) inset',
        overlay: 'var(--shadow-overlay)',
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
