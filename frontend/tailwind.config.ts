import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  // Antes so cobria src/app e src/components - o Tailwind precisa "ver" o
  // texto literal de cada classe (ex.: "text-emerald-700") em algum
  // arquivo varrido por esses caminhos, senao ele nem gera aquele CSS.
  // src/lib/coresAchados.ts guarda essas classes como strings (pra ser
  // reaproveitado em varios componentes, sem repetir a cor em cada tela) -
  // como src/lib nao estava coberto, o Tailwind nunca via essas classes e
  // simplesmente nao gerava o CSS delas (cards do Banco de imagens sem
  // cor, titulos sem cor etc.). Ampliado pra cobrir todo o src/, assim
  // qualquer arquivo novo dentro dele (lib, types, ou outro que apareça no
  // futuro) e varrido automaticamente, sem precisar lembrar de atualizar
  // esta lista de novo.
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
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
