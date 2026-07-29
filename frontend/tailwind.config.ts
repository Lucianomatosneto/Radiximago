import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#0a0e1a',
          surface: '#0f1524',
          surface2: '#111a2e',
          border: '#1e293b',
        },
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(59, 130, 246, 0.25)',
      },
    },
  },
  plugins: [],
}

export default config
