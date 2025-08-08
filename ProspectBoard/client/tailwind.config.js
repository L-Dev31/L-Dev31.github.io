/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        olo: {
          primary: '#0891B2',     // Cyan-600 comme couleur principale
          secondary: '#155E75',   // Cyan-800 comme couleur secondaire
          accent: '#06B6D4',      // Cyan-500 comme accent
          light: '#A7F3D0',       // Vert clair
          dark: '#0F172A',        // Slate-900
          'primary-50': '#F0F9FF',
          'primary-100': '#E0F2FE',
          'primary-200': '#BAE6FD',
          'primary-300': '#7DD3FC',
          'primary-400': '#38BDF8',
          'primary-500': '#0891B2',
          'primary-600': '#0284C7',
          'primary-700': '#0369A1',
          'primary-800': '#075985',
          'primary-900': '#0C4A6E',
          'secondary-50': '#F0F9FF',
          'secondary-100': '#E0F2FE',
          'secondary-200': '#BAE6FD',
          'secondary-300': '#7DD3FC',
          'secondary-400': '#38BDF8',
          'secondary-500': '#155E75',
          'secondary-600': '#0E7490',
          'secondary-700': '#0891B2',
          'secondary-800': '#155E75',
          'secondary-900': '#164E63'
        },
        dark: {
          bg: {
            primary: '#000000',     // OLED noir pur
            secondary: '#111111',   // Noir très légèrement plus clair
            tertiary: '#1A1A1A'     // Gris très sombre pour les cartes
          },
          text: {
            primary: '#FFFFFF',     // Blanc pur
            secondary: '#CCCCCC',   // Gris clair
            tertiary: '#888888'     // Gris moyen
          },
          border: '#222222',        // Bordure très sombre
          hover: '#1A1A1A'         // Hover très subtil
        },
        gray: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'monospace']
      },
      boxShadow: {
        'olo': '0 4px 14px 0 rgba(8, 145, 178, 0.3)',
        'olo-lg': '0 10px 25px 0 rgba(8, 145, 178, 0.4)',
        'primary': '0 4px 14px 0 rgba(8, 145, 178, 0.3)',
        'primary-lg': '0 10px 25px 0 rgba(8, 145, 178, 0.4)',
        'secondary': '0 4px 14px 0 rgba(21, 94, 117, 0.3)',
        'secondary-lg': '0 10px 25px 0 rgba(21, 94, 117, 0.4)',
        'accent': '0 4px 14px 0 rgba(6, 182, 212, 0.3)',
        'accent-lg': '0 10px 25px 0 rgba(6, 182, 212, 0.4)',
        'dark': '0 4px 14px 0 rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 10px 25px 0 rgba(0, 0, 0, 0.6)',
        'soft': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 12px rgba(0, 0, 0, 0.08)',
        'strong': '0 8px 24px rgba(0, 0, 0, 0.12)',
        'glow': '0 0 20px rgba(6, 182, 212, 0.5)'
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'bounce-gentle': 'bounceGentle 0.6s ease-in-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        bounceGentle: {
          '0%, 20%, 53%, 80%, 100%': { transform: 'translateY(0)' },
          '40%, 43%': { transform: 'translateY(-8px)' },
          '70%': { transform: 'translateY(-4px)' },
          '90%': { transform: 'translateY(-2px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(6, 182, 212, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(6, 182, 212, 0.8)' }
        }
      },
    },
  },
  plugins: [],
}
