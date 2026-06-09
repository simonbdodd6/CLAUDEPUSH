/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#09090E',
          1: '#0F1015',
          2: '#15161E',
          3: '#1C1E2A',
          4: '#232637',
        },
        ink: {
          1: '#F0F1FA',
          2: '#9294AE',
          3: '#52556E',
        },
        accent:  { DEFAULT: '#6366F1', hover: '#4F52D9', dim: 'rgba(99,102,241,0.18)' },
        success: { DEFAULT: '#22C55E', dim: 'rgba(34,197,94,0.15)' },
        warning: { DEFAULT: '#F59E0B', dim: 'rgba(245,158,11,0.15)' },
        danger:  { DEFAULT: '#EF4444', dim: 'rgba(239,68,68,0.15)' },
        border:  { subtle: 'rgba(255,255,255,0.06)', DEFAULT: 'rgba(255,255,255,0.11)' },
      },
      fontFamily: {
        sans: ['SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        card:    '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
        lifted:  '0 8px 24px rgba(0,0,0,0.5)',
        glow:    '0 0 20px rgba(99,102,241,0.25)',
      },
      keyframes: {
        fadeIn:     { from: { opacity: 0 },                  to: { opacity: 1 } },
        slideUp:    { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideDown:  { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn:    { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        pulse2:     { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
        shimmer:    { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        cmdOpen:    { from: { opacity: 0, transform: 'scale(0.97) translateY(-4px)' }, to: { opacity: 1, transform: 'scale(1) translateY(0)' } },
      },
      animation: {
        fadeIn:   'fadeIn 0.15s ease',
        slideUp:  'slideUp 0.2s cubic-bezier(0.22,1,0.36,1)',
        slideDown:'slideDown 0.15s ease',
        scaleIn:  'scaleIn 0.2s cubic-bezier(0.22,1,0.36,1)',
        pulse2:   'pulse2 2s ease-in-out infinite',
        shimmer:  'shimmer 1.6s linear infinite',
        cmdOpen:  'cmdOpen 0.2s cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
};
