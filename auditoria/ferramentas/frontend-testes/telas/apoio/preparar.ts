// O jsdom (navegador simulado) nao tem algumas pecas que as telas usam so
// para EFEITO VISUAL (rolar ate um item, saber se a miniatura esta visivel,
// tema claro/escuro, tela cheia). Aqui elas viram versoes "que nao fazem nada",
// iguais em todos os testes de telas. Nada disso muda regra de negocio.
// Roda antes de cada arquivo de teste (setupFiles do vitest.config.ts);
// nos testes que nao sao de tela (ambiente node) nao faz nada.
import { vi } from 'vitest'

if (typeof window !== 'undefined') {
  // rolar a pagina / ate um elemento
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()

  // tema do sistema (ThemeToggle): sempre "escuro", sem mudar
  window.matchMedia = vi.fn((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia

  // "esta visivel?" (miniaturas carregam so quando aparecem): nunca dispara,
  // entao as miniaturas NAO pedem imagens ao servidor nos testes de telas
  class ObservadorParado {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  window.IntersectionObserver = ObservadorParado as unknown as typeof IntersectionObserver
  window.ResizeObserver = ObservadorParado as unknown as typeof ResizeObserver

  // tela cheia: o navegador simulado "recusa" (as telas ja tratam isso)
  document.documentElement.requestFullscreen = vi.fn(() => Promise.reject(new Error('sem tela cheia no teste')))
}
