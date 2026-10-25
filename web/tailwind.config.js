/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // SkillSpring palette: deep navy surfaces, indigo/violet primaries,
        // electric blue accents.
        navy: {
          50: '#f2f5fd',
          100: '#e3e9fa',
          200: '#c7d3f4',
          300: '#a1b4ea',
          400: '#738ddc',
          500: '#4f66cc',
          600: '#3c4cb0',
          700: '#323d8e',
          800: '#2c3574',
          900: '#1b2148',
          950: '#0b1020',
        },
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        electric: {
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        surface: {
          light: '#ffffff',
          'light-alt': '#f7f8fd',
          dark: '#0b1020',
          'dark-alt': '#131a33',
          'dark-raised': '#1a2246',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 16, 32, 0.04), 0 8px 24px -12px rgba(11, 16, 32, 0.12)',
        'card-dark': '0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px -16px rgba(0, 0, 0, 0.6)',
        glow: '0 0 0 1px rgba(99, 102, 241, 0.35), 0 8px 32px -8px rgba(99, 102, 241, 0.4)',
        'glow-sm': '0 0 0 1px rgba(99, 102, 241, 0.3), 0 4px 16px -6px rgba(99, 102, 241, 0.35)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #0ea5e9 100%)',
        'gradient-brand-soft':
          'linear-gradient(135deg, rgba(79,70,229,0.12) 0%, rgba(124,58,237,0.10) 50%, rgba(14,165,233,0.12) 100%)',
        'gradient-mesh':
          'radial-gradient(at 20% 20%, rgba(99,102,241,0.28) 0px, transparent 55%), radial-gradient(at 80% 10%, rgba(124,58,237,0.22) 0px, transparent 50%), radial-gradient(at 70% 80%, rgba(14,165,233,0.22) 0px, transparent 55%)',
        'grid-faint':
          'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)',
      },
      keyframes: {
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'draw-line': {
          from: { strokeDashoffset: '1' },
          to: { strokeDashoffset: '0' },
        },
      },
      animation: {
        'gradient-shift': 'gradient-shift 12s ease infinite',
        float: 'float 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s infinite',
        'fade-up': 'fade-up 0.5s ease-out both',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      borderRadius: {
        '2.5xl': '1.25rem',
        '4xl': '2rem',
      },
      screens: {
        xs: '420px',
      },
    },
  },
  plugins: [],
};
