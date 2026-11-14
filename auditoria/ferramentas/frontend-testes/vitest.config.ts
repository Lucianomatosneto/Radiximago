// Vitest = executor de testes de funções do frontend (rápido, sem navegador).
// "npm run cobertura" mede quanto do código do frontend (frontend/src) os
// testes exercitam e grava frontend/coverage/lcov.info para o SonarCloud.
//
// Desde 13/11/2026 também roda os TESTES DE TELAS (telas/**/*.test.tsx):
// a tela de verdade é montada num "navegador simulado" (jsdom) com a
// React Testing Library; o servidor é trocado por respostas inventadas.
// Guia do padrão: frontend/testes/LEIA-ME.md.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const modulosFrontend = path.resolve(aqui, '../../../frontend/node_modules')

export default defineConfig({
  // o frontend usa jsx "preserve" (o Next.js transforma); aqui o JSX vira codigo comum
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    // UMA copia so do React: a do frontend (a mesma que a tela usa). Sem isso a
    // Testing Library traria a copia desta pasta e o React reclamaria de
    // "dois Reacts" (hooks quebram). O next/navigation tambem vem do frontend,
    // para o vi.mock dos testes casar com o import da tela.
    alias: [
      { find: /^react$/, replacement: path.join(modulosFrontend, 'react/index.js') },
      { find: /^react\/(.*)$/, replacement: path.join(modulosFrontend, 'react/$1') },
      { find: /^react-dom$/, replacement: path.join(modulosFrontend, 'react-dom/index.js') },
      { find: /^react-dom\/(.*)$/, replacement: path.join(modulosFrontend, 'react-dom/$1') },
      { find: /^next\/navigation$/, replacement: path.join(modulosFrontend, 'next/navigation.js') },
      // a Testing Library na versao "import" (ESM): assim os imports dela de
      // react/react-dom tambem passam pelos aliases acima (a versao "require" nao passa)
      { find: /^@testing-library\/react$/, replacement: path.resolve(aqui, 'node_modules/@testing-library/react/dist/@testing-library/react.esm.js') },
      // as traducoes: a mesma copia da tela (o "provedor" do teste e o da tela precisam ser um so)
      { find: /^next-intl$/, replacement: path.join(modulosFrontend, 'next-intl') },
    ],
  },
  test: {
    // telas/*.test.tsx escolhem o ambiente jsdom na 1a linha (// @vitest-environment jsdom)
    include: ['vitest/**/*.test.ts', 'telas/**/*.test.tsx'],
    environment: 'node',
    // endereco ficticio do servidor: as telas leem NEXT_PUBLIC_API_URL ao carregar
    env: { NEXT_PUBLIC_API_URL: 'http://api.teste' },
    // pecas visuais que o navegador simulado nao tem (rolar, tema, tela cheia...)
    setupFiles: ['telas/apoio/preparar.ts'],
    // a Testing Library precisa passar pelos aliases acima (copia unica do React)
    server: { deps: { inline: [/@testing-library/] } },
    coverage: {
      provider: 'v8',
      // todo o codigo do frontend entra na conta, inclusive o que nenhum teste toca
      include: ['../../../frontend/src/**/*.{ts,tsx}'],
      // EXCLUSAO DOS MOTORES GRAFICOS (decisao do Luciano, 14/11/2026, PR #75).
      // Os dois arquivos abaixo CONTINUAM no sistema; so saem da CONTA da cobertura:
      // - sao motores puramente decorativos (desenho em canvas 2D e WebGL/Three.js):
      //   o globo e a cena da tela de login, e o mapa-mundi do fundo;
      // - nao tem regra de negocio, nao leem nem gravam dados de pessoas e nao
      //   tocam em dados de pacientes;
      // - nao sao testaveis de forma util por teste automatico (o navegador de
      //   teste, jsdom, nao desenha; simular o canvas inteiro nao provaria o que
      //   a pessoa ve);
      // - sao conferidos visualmente;
      // - a lista e NOMEADA, arquivo por arquivo, SEM curinga, para ninguem
      //   esconder codigo real por engano. Nao acrescentar nada aqui sem decisao
      //   registrada. A mesma lista esta no Sonar (sonar.coverage.exclusions).
      // Documento: auditoria/DECISAO_exclusao_motores_graficos_cobertura_2026-11-14.md
      exclude: [
        '**/*.d.ts',
        '../../../frontend/src/components/login/motorCenaLogin.ts',
        '../../../frontend/src/components/fundo/motorMapaMundi.ts',
      ],
      allowExternal: true,
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: '../../../frontend/coverage',
      // CATRACA: minimo atual (medido em 14/11/2026, Fase 3b SEM os 2 motores
      // graficos: linhas 76,58%; com eles seriam 73,12%; PR 3a: 59,43%; Fase 2: 56,17%; Fase 1: 33,39%; Fase 0: 14,77%). Se a cobertura cair abaixo disto, o Vitest com
      // --coverage FALHA (no GitHub: workflow "Testes do frontend"). A cada PR
      // que acrescenta testes, subir estes numeros; nunca baixar sem justificar.
      thresholds: {
        lines: 76.5,
        statements: 74.7,
        branches: 69.6,
        functions: 72.2,
      },
    },
  },
})
