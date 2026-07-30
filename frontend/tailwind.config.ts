import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta do Design System RÁDIX IMAGO (Figma "Foundations", 2026).
        // Mantidas as mesmas chaves ja usadas no app (base, base-surface,
        // base-surface2, base-border) so os valores mudaram - nenhuma
        // classe existente precisa ser renomeada.
        base: {
          DEFAULT: '#0a0c10', // bg/canvas
          surface: '#14171c', // bg/surface
          surface2: '#1c2028', // bg/surface-elevated
          border: '#262b35', // border/default
        },
        brand: {
          DEFAULT: '#2563eb', // bg/brand
          hover: '#3b82f6',
          active: '#1d3a66',
          50: '#dbeafe',
          300: '#60a5fa',
          700: '#13294b',
        },
        status: {
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#60a5fa',
        },
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(37, 99, 235, 0.25)',
      },
    },
  },
  plugins: [],
}

export default config
