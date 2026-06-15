import { hudTheme } from './design/theme.js'

/** @type {import('tailwindcss').Config} */
export default {
  // Explicit dirs only (never a bare ./**) so Tailwind does not scan node_modules.
  content: [
    './app/index.html',
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './panels/**/*.{js,jsx}',
    './shell/**/*.{js,jsx}',
    './visuals/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: { 0: '#0C0D12', 1: '#111318', 2: '#181B24', 3: '#1F2333', 4: '#252A3D' },
        ink:     { 1: '#ECEEF5', 2: '#8B8FA8', 3: '#4E5270' },
        accent:  { DEFAULT: '#6366F1', hover: '#4F52D9', dim: 'rgba(99,102,241,0.15)' },
        success: { DEFAULT: '#22C55E', dim: 'rgba(34,197,94,0.12)' },
        warning: { DEFAULT: '#EAB308', dim: 'rgba(234,179,8,0.12)' },
        danger:  { DEFAULT: '#EF4444', dim: 'rgba(239,68,68,0.12)' },
        border:  { subtle: 'rgba(255,255,255,0.055)', DEFAULT: 'rgba(255,255,255,0.1)' },
        // Ported HUD palette (design/tokens.css + design/theme.js)
        ...hudTheme.colors,
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: { DEFAULT: '10px', lg: '14px', xl: '18px' },
      boxShadow: {
        card:   '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.055)',
        lifted: '0 8px 32px rgba(0,0,0,0.5)',
        accent: '0 0 24px rgba(99,102,241,0.25)',
        glow:   '0 0 40px rgba(99,102,241,0.15)',
        ...hudTheme.boxShadow,
      },
      animation: {
        'fade-in':   'fadeIn 0.15s ease',
        'slide-up':  'slideUp 0.2s ease',
        'slide-in':  'slideIn 0.25s cubic-bezier(0.22,1,0.36,1)',
        'pulse-slow':'pulse 3s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideIn: { from: { opacity: 0, transform: 'translateY(-10px) scale(0.98)' }, to: { opacity: 1, transform: 'translateY(0) scale(1)' } },
      },
      transitionTimingFunction: { spring: 'cubic-bezier(0.34,1.56,0.64,1)' },
    },
  },
  plugins: [],
}
