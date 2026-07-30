import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta do Design System RÁDIX IMAGO (Figma "Foundations", 2026).
        // Mesmas chaves de sempre (base, brand, status) mas agora
        // apontando pra variaveis CSS (ver globals.css :root/.dark/.light)
        // pra sustentar o alternador de tema claro/escuro - nenhuma classe
        // existente precisa ser renomeada.
        base: {
          DEFAULT: 'rgb(var(--color-base) / <alpha-value>)',
          surface: 'rgb(var(--color-base-surface) / <alpha-value>)',
          surface2: 'rgb(var(--color-base-surface2) / <alpha-value>)',
          border: 'rgb(var(--color-base-border) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          hover: 'rgb(var(--color-brand-hover) / <alpha-value>)',
          active: 'rgb(var(--color-brand-active) / <alpha-value>)',
          50: 'rgb(var(--color-brand-50) / <alpha-value>)',
          300: 'rgb(var(--color-brand-300) / <alpha-value>)',
          700: 'rgb(var(--color-brand-700) / <alpha-value>)',
        },
        status: {
          success: 'rgb(var(--color-status-success) / <alpha-value>)',
          warning: 'rgb(var(--color-status-warning) / <alpha-value>)',
          danger: 'rgb(var(--color-status-danger) / <alpha-value>)',
          info: 'rgb(var(--color-status-info) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          2: 'rgb(var(--color-ink-2) / <alpha-value>)',
          3: 'rgb(var(--color-ink-3) / <alpha-value>)',
          4: 'rgb(var(--color-ink-4) / <alpha-value>)',
        },
        // O Design System usa varios tons de "slate" cru (text-slate-300,
        // border-slate-700, etc.) em vez dos tokens acima - sobrescrevemos
        // so as pontas realmente usadas hoje (ver grep antes desta edicao)
        // pra apontar pros mesmos tokens de tema, sem precisar editar
        // classe por classe em cada tela.
        slate: {
          100: 'rgb(var(--color-ink) / <alpha-value>)',
          200: 'rgb(var(--color-ink-2) / <alpha-value>)',
          300: 'rgb(var(--color-ink-2) / <alpha-value>)',
          400: 'rgb(var(--color-ink-3) / <alpha-value>)',
          500: 'rgb(var(--color-ink-4) / <alpha-value>)',
          600: 'rgb(var(--color-ink-4) / <alpha-value>)',
          700: 'rgb(var(--color-base-border) / <alpha-value>)',
        },
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        glow: '0 0 40px -10px rgb(var(--color-brand) / 0.25)',
      },
    },
  },
  plugins: [],
}

export default config
