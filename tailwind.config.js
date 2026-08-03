/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EAF2F4', 100: '#D2E5E9', 200: '#A6CBD2', 300: '#73AAB6',
          400: '#3F7E8E', 500: '#0F4C5C', 600: '#0C3E4B', 700: '#092F3A',
          800: '#061F27', 900: '#04141A',
        },
        accent: {
          50: '#FFF4EC', 100: '#FFE6D4', 200: '#FFC8A8', 300: '#FFA571',
          400: '#FB8A3E', 500: '#F97316', 600: '#E25F08', 700: '#B84A07',
          800: '#8A3805', 900: '#5C2503',
        },
        gold: {
          50: '#FBF6E8', 100: '#F6ECCF', 200: '#ECD89E', 300: '#E0C26B',
          400: '#D4A843', 500: '#B98E2F', 600: '#947024', 700: '#6E531A',
          800: '#483711', 900: '#221B08',
        },
        sand: {
          50: '#F7F5EF', 100: '#F0EDE5', 200: '#E6E2DA', 300: '#D6D1C4',
          400: '#B8B2A1', 500: '#8E8878', 600: '#6B6657', 700: '#4A4639',
          800: '#2E2B23', 900: '#18181B',
        },
        ink: '#18181B',
        success: {
          50: '#ECFDF5', 100: '#D1FAE5', 200: '#A7F3D0', 300: '#6EE7B7',
          400: '#34D399', 500: '#22C55E', 600: '#16A34A', 700: '#15803D',
          800: '#166534', 900: '#14532D',
        },
        warning: {
          50: '#FFFBEB', 100: '#FEF3C7', 200: '#FDE68A', 300: '#FCD34D',
          400: '#FBBF24', 500: '#F59E0B', 600: '#D97706', 700: '#B45309',
          800: '#92400E', 900: '#78350F',
        },
        danger: {
          50: '#FEF2F2', 100: '#FEE2E2', 200: '#FECACA', 300: '#FCA5A5',
          400: '#F87171', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C',
          800: '#991B1B', 900: '#7F1D1D',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '"Cairo"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"IBM Plex Sans Arabic"', '"Cairo"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        ink: ['"Aref Ruqaa Ink"', '"Scheherazade New"', '"IBM Plex Sans Arabic"', 'serif'],
      },
      borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
      boxShadow: {
        'soft': '0 1px 2px rgba(15,76,92,0.04), 0 4px 16px rgba(15,76,92,0.06)',
        'card': '0 1px 3px rgba(15,76,92,0.05), 0 8px 28px rgba(15,76,92,0.08)',
        'lift': '0 2px 6px rgba(15,76,92,0.06), 0 18px 48px rgba(15,76,92,0.12)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-down': { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'slide-in-left': { '0%': { opacity: '0', transform: 'translateX(-16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'scale-pop': { '0%': { opacity: '0', transform: 'scale(0.92)' }, '60%': { opacity: '1', transform: 'scale(1.02)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'page-in': { '0%': { opacity: '0', transform: 'translateY(8px) scale(0.995)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        'blink': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.4,0,0.2,1) both',
        'fade-up': 'fade-up 250ms cubic-bezier(0.22,1,0.36,1) both',
        'fade-down': 'fade-down 250ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-left': 'slide-in-left 220ms cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.22,1,0.36,1) both',
        'scale-pop': 'scale-pop 250ms cubic-bezier(0.22,1,0.36,1) both',
        'page-in': 'page-in 220ms cubic-bezier(0.22,1,0.36,1) both',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
};
