'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { obterSessaoAtual } from '../lib/sessao'
import { type LucideIcon, Camera, ChartColumn, ClipboardList, GraduationCap, History, Hourglass, Inbox, LayoutDashboard, Library, Lightbulb, LogOut, MessagesSquare, Plug, ScrollText, Settings, Share2, SlidersHorizontal, Star, Stethoscope, Tags, Users, Zap } from 'lucide-react'

interface ItemMenu {
  chave: string
  href: string
  ativo: boolean
  /** Perfis que veem este item. Omitido = visivel pra qualquer perfil
   * autenticado (ex.: Início, Pesquisa avançada, Banco de imagens). */
  perfis?: string[]
  /** Cor da "caixinha" deste item (fundo em gradiente + borda + texto) -
   * mesmo esquema usado nas caixas de tipo de radiografia da Pesquisa
   * avançada (Periapical/Panorâmica/Interproximal/Oclusal), so que aqui
   * cada item do menu tem a SUA PROPRIA cor (por pedido), pra ficar facil
   * de diferenciar um item do outro so pela cor. */
  cor: string
  /** icone da secao (lucide-react) - aparece no menu recolhido, com o nome em dica */
  icone: LucideIcon
}

const PERFIS_ADMIN_APENAS = ['administrador']
const PERFIS_ADMIN_E_CURADOR = ['administrador', 'curador']
// Quem pode enviar imagens novas (POST /images/upload no backend) - alem de
// administrador/curador, agora tambem professor. Ver PERFIS_ENVIO_IMAGENS
// em auth.py (backend) para o raciocinio completo.
const PERFIS_ENVIO_IMAGENS = ['administrador', 'curador', 'professor']

// So tons ENTRE azul e verde no circulo cromatico (por pedido) - nessa
// ordem, do lado mais azul pro lado mais verde: blue -> sky -> cyan -> teal
// -> emerald -> green -> lime. Com 13 itens de menu e so 7 tons nessa
// faixa, os tons se repetem uma vez (o 8o item volta pro blue) - ainda
// assim nao ha repeticao entre itens vizinhos.
const COR_BLUE = 'from-blue-100 to-blue-50 border-blue-300 text-blue-700 dark:from-blue-600/30 dark:to-blue-900/10 dark:border-blue-700/40 dark:text-blue-300'
const COR_SKY = 'from-sky-100 to-sky-50 border-sky-300 text-sky-700 dark:from-sky-600/30 dark:to-sky-900/10 dark:border-sky-700/40 dark:text-sky-300'
const COR_CYAN = 'from-cyan-100 to-cyan-50 border-cyan-300 text-cyan-700 dark:from-cyan-600/30 dark:to-cyan-900/10 dark:border-cyan-700/40 dark:text-cyan-300'
const COR_TEAL = 'from-teal-100 to-teal-50 border-teal-300 text-teal-700 dark:from-teal-600/30 dark:to-teal-900/10 dark:border-teal-700/40 dark:text-teal-300'
const COR_EMERALD = 'from-emerald-100 to-emerald-50 border-emerald-300 text-emerald-700 dark:from-emerald-600/30 dark:to-emerald-900/10 dark:border-emerald-700/40 dark:text-emerald-300'
const COR_GREEN = 'from-green-100 to-green-50 border-green-300 text-green-700 dark:from-green-600/30 dark:to-green-900/10 dark:border-green-700/40 dark:text-green-300'
const COR_LIME = 'from-lime-100 to-lime-50 border-lime-300 text-lime-700 dark:from-lime-600/30 dark:to-lime-900/10 dark:border-lime-700/40 dark:text-lime-300'
// As cores sao distribuidas pela POSICAO de cada item VISIVEL (o menu muda
// conforme o perfil): assim itens vizinhos nunca ficam com a mesma cor e
// todo perfil ve a faixa inteira azul -> verde (o estudante, com poucos
// itens, nao fica so com tons de azul).
const PALETA_MENU = [COR_BLUE, COR_SKY, COR_CYAN, COR_TEAL, COR_EMERALD, COR_GREEN, COR_LIME]

const ITENS_MENU: ItemMenu[] = [
  // Inicio (painel de indicadores) so para o administrador: para os demais
  // perfis o Inicio E o Banco de imagens (item repetido - 27/10/2026)
  { chave: 'inicio', href: '/dashboard', ativo: true, icone: LayoutDashboard, perfis: PERFIS_ADMIN_APENAS, cor: COR_BLUE },
  { chave: 'painelAdministrativo', href: '/painel-admin', ativo: true, icone: Settings, perfis: PERFIS_ADMIN_APENAS, cor: COR_SKY },
  { chave: 'usuarios', href: '/usuarios', ativo: true, icone: Users, perfis: PERFIS_ADMIN_APENAS, cor: COR_CYAN },
  { chave: 'imagensRecebidas', href: '/imagens', ativo: true, icone: Inbox, perfis: PERFIS_ENVIO_IMAGENS, cor: COR_TEAL },
  { chave: 'curadoria', href: '/curadoria', ativo: true, icone: ClipboardList, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_EMERALD },
  { chave: 'segundaOpiniao', href: '/segunda-opiniao', ativo: true, icone: MessagesSquare, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_GREEN },
  // "Pesquisa avancada" saiu do menu: ja e acessada pelo Banco de imagens
  // (cartoes e botao) e por Minhas imagens
  { chave: 'bancoImagens', href: '/banco-imagens', ativo: true, icone: Library, cor: COR_BLUE },
  { chave: 'minhasImagens', href: '/minhas-imagens', ativo: true, icone: Star, cor: COR_SKY },
  { chave: 'compartilhadasComigo', href: '/compartilhadas-comigo', ativo: true, icone: Share2, cor: COR_BLUE },
  // Pastas de pacientes (fotos do negatoscopio) - 31/10/2026
  { chave: 'uploadCamera', href: '/casos/novo', ativo: true, icone: Camera, perfis: ['estudante', 'professor', 'curador'], cor: COR_TEAL },
  { chave: 'meusPacientes', href: '/casos/meus-tratamentos', ativo: true, icone: Stethoscope, perfis: ['estudante'], cor: COR_CYAN },
  { chave: 'aguardandoTratamento', href: '/casos/fila', ativo: true, icone: Hourglass, perfis: ['professor', 'curador'], cor: COR_CYAN },
  { chave: 'alunosPacientes', href: '/casos/tratamentos', ativo: true, icone: GraduationCap, perfis: ['professor', 'curador'], cor: COR_TEAL },
  { chave: 'registroAcessos', href: '/casos/acessos', ativo: true, icone: History, perfis: ['administrador', 'curador', 'professor'], cor: COR_EMERALD },
  { chave: 'vocabulario', href: '/vocabulario', ativo: true, icone: Tags, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_TEAL },
  { chave: 'macros', href: '/macros', ativo: true, icone: Zap, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_CYAN },
  { chave: 'relatorios', href: '/relatorios', ativo: true, icone: ChartColumn, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_CYAN },
  { chave: 'auditoria', href: '/auditoria', ativo: true, icone: ScrollText, perfis: PERFIS_ADMIN_APENAS, cor: COR_TEAL },
  { chave: 'integracoes', href: '/integracoes', ativo: true, icone: Plug, perfis: PERFIS_ADMIN_APENAS, cor: COR_EMERALD },
  { chave: 'configuracoes', href: '/configuracoes', ativo: true, icone: SlidersHorizontal, perfis: PERFIS_ADMIN_APENAS, cor: COR_GREEN },
  // Sugestoes de melhoria (30/10/2026): todos enviam; o administrador ve a lista completa
  { chave: 'sugestoes', href: '/sugestoes', ativo: true, icone: Lightbulb, cor: COR_LIME },
]

// `recolhivel`: a tela pede o menu RECOLHIDO (uma faixa fina com o botao
// "☰"), para sobrar espaco para o conteudo (ex.: grade de imagens da
// Pesquisa). O botao abre o menu inteiro e outro clique recolhe de novo.
export default function Sidebar({ recolhivel = false }: { recolhivel?: boolean } = {}) {
  const t = useTranslations('Sidebar')
  const [recolhido, setRecolhido] = useState(recolhivel)
  // celular e tablet estreito (<768px): o menu comeca recolhido em TODAS as
  // telas (o menu aberto ocupava mais da metade da largura do celular)
  const [telaEstreita, setTelaEstreita] = useState(false)
  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 767px)')
    const aplicar = () => {
      setTelaEstreita(consulta.matches)
      if (consulta.matches) setRecolhido(true)
    }
    aplicar()
    consulta.addEventListener('change', aplicar)
    return () => consulta.removeEventListener('change', aplicar)
  }, [])
  const podeRecolher = recolhivel || telaEstreita
  const router = useRouter()
  const pathname = usePathname()
  const [perfil, setPerfil] = useState<string | null>(null)

  useEffect(() => {
    obterSessaoAtual().then((sessao) => setPerfil(sessao?.perfil ?? null))
  }, [])

  // Quantas imagens chegaram em "Compartilhadas comigo" e ainda nao foram
  // vistas - mostrado como um numero ao lado do item do menu.
  const [novasCompartilhadas, setNovasCompartilhadas] = useState(0)
  useEffect(() => {
    let cancelado = false
    function contar() {
      // imagens do banco compartilhadas + pastas de pacientes novas (professor/curador)
      const ler = (caminho: string) =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((dados) => (dados?.quantidade as number) ?? 0)
          .catch(() => 0)
      Promise.all([ler('/shares/recebidas/novas'), ler('/casos/recebidos/novos')]).then(([a, b]) => {
        if (!cancelado) setNovasCompartilhadas(a + b)
      })
    }
    contar()
    const id = setInterval(contar, 60000)
    window.addEventListener('radix-compartilhadas-vistas', contar)
    return () => {
      cancelado = true
      clearInterval(id)
      window.removeEventListener('radix-compartilhadas-vistas', contar)
    }
  }, [])

  // A Curadoria abre a primeira imagem em tela cheia automaticamente, sem
  // exigir clique extra do usuario - mas requestFullscreen() so e aceito
  // pelo navegador DENTRO (ou bem perto) de uma interacao real do
  // usuario. Tentar pedir tela cheia DEPOIS que os dados da Curadoria
  // terminam de carregar (fetches assincronos: criar ficha, buscar
  // viewer-url, buscar ficha completa) quase sempre estoura essa janela
  // - e exatamente por isso que a abordagem antiga (useEffect + listener
  // de fallback em pointerdown/keydown, tentando reagir DEPOIS que os
  // dados chegam) nunca foi confiavel.
  //
  // A correcao: pedir tela cheia AQUI, no PROPRIO clique no item
  // "Curadoria" do menu - o momento mais cedo e mais confiavel possivel
  // pra uma interacao do usuario, antes mesmo da navegacao/carregamento
  // comecar. O alvo e document.documentElement (o <html> inteiro, nao um
  // elemento especifico da pagina de Curadoria) de proposito: como essa
  // navegacao e client-side (Next.js App Router), document.documentElement
  // e o MESMO objeto DOM antes e depois da troca de rota (o root layout -
  // <html>/<body> - nunca e desmontado numa navegacao interna, so o
  // conteudo da pagina dentro dele troca) - entao a tela cheia pedida
  // aqui sobrevive a transicao pra /curadoria sem interrupcao. Pedir
  // fullscreen num elemento ESPECIFICO da Curadoria (como se fazia antes,
  // com visualizadorRef) e inviavel a partir daqui: esse elemento so
  // existe depois que o React da pagina de destino renderiza, o que so
  // acontece DEPOIS da navegacao - ja tarde demais pra ativacao do clique
  // valer.
  //
  // A Curadoria (curadoria/page.tsx) fica responsavel por: 1) esconder
  // Topbar/cabecalho quando detectar tela cheia (a Fullscreen API nao
  // esconde nada sozinha quando o alvo e a pagina inteira, diferente de
  // quando o alvo e um elemento especifico); 2) sair da tela cheia
  // quando o curador navega pra outra tela (senao "vazaria" pra
  // qualquer pagina seguinte, ja que document.documentElement persiste).
  function aoClicarCuradoria() {
    document.documentElement.requestFullscreen().catch(() => {
      // Navegador pode negar (varia por navegador/SO, mais comum do que
      // o ideal na pratica) - a Curadoria continua funcionando
      // normalmente, so sem a tela cheia automatica; ha 2 redes de
      // seguranca dentro dela (ver curadoria/page.tsx): uma tentativa
      // silenciosa no primeiro clique/tecla do curador la dentro, e o
      // botao manual "Tela cheia" (sempre visivel, garantia final).
    })
  }

  async function handleSair() {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // segue pro login mesmo se a chamada falhar - nao trava a UI
    }
    // recarrega a pagina inteira: descarta da memoria do navegador o que foi
    // carregado com o login (OWASP ASVS 14.3.1)
    window.location.replace('/login')
  }

  // Antes do perfil carregar (1o render, GET /auth/me ainda em voo), nao
  // mostra os itens restritos - evita um "flash" deles pra quem nao tem
  // acesso.
  const itensVisiveis = ITENS_MENU.filter((item) => !item.perfis || (perfil !== null && item.perfis.includes(perfil)))

  const botaoRecolher = podeRecolher && (
    <button
      type="button"
      onClick={() => setRecolhido((v) => !v)}
      aria-expanded={!recolhido}
      title={recolhido ? t('abrirMenu') : t('recolherMenu')}
      aria-label={recolhido ? t('abrirMenu') : t('recolherMenu')}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-base-border text-slate-300 transition hover:border-brand hover:text-brand-300"
    >
      {recolhido ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      )}
    </button>
  )

  // MENU RECOLHIDO (01/11/2026): os icones das secoes, com o nome numa dica
  // ao passar o mouse ou focar pelo teclado (e no aria-label)
  if (podeRecolher && recolhido) {
    return (
      <aside className="flex h-screen w-14 shrink-0 flex-col items-center justify-between border-r border-base-border bg-base py-4 print:hidden" aria-label={t('navegacao')}>
        <div className="flex flex-col items-center gap-3">
          {botaoRecolher}
          <nav className="flex flex-col items-center gap-1">
            {itensVisiveis.filter((item) => item.ativo).map((item) => {
              const Icone = item.icone
              const estaAtivo = pathname === item.href || pathname?.startsWith(`${item.href}/`)
              const rotulo = t(`itens.${item.chave}`)
              return (
                <Link
                  key={item.chave}
                  href={item.href}
                  aria-label={rotulo}
                  aria-current={estaAtivo ? 'page' : undefined}
                  onClick={item.chave === 'curadoria' ? aoClicarCuradoria : undefined}
                  className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition ${estaAtivo ? 'bg-brand/15 text-brand ring-1 ring-brand' : 'text-slate-400 hover:bg-base-surface2 hover:text-ink'}`}
                >
                  <Icone aria-hidden="true" className="h-5 w-5" />
                  {item.chave === 'compartilhadasComigo' && novasCompartilhadas > 0 && (
                    <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400" />
                  )}
                  <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-base-border bg-base-surface px-2 py-1 text-xs font-medium text-ink shadow-lg group-hover:block group-focus-visible:block">
                    {rotulo}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>
        <button type="button" onClick={handleSair} aria-label={t('sair')} className="group relative flex h-10 w-10 items-center justify-center rounded-lg text-status-danger hover:bg-red-950/30">
          <LogOut aria-hidden="true" className="h-5 w-5" />
          <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-base-border bg-base-surface px-2 py-1 text-xs font-medium text-ink shadow-lg group-hover:block group-focus-visible:block">
            {t('sair')}
          </span>
        </button>
      </aside>
    )
  }

  return (
    <aside className={`flex h-screen w-60 shrink-0 flex-col justify-between border-r border-base-border bg-base lg:w-64 ${telaEstreita ? 'fixed left-0 top-0 z-40 shadow-2xl' : ''}`}>
      <div>
        <div className="flex items-center justify-between border-b border-base-border px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{t('navegacao')}</p>
          {botaoRecolher}
        </div>

        <nav className="mt-3 flex flex-col gap-1 px-3">
          {itensVisiveis.map((item, posicao) => {
            // menu curto (ate 7 itens, ex.: estudante): cores espalhadas pela
            // faixa inteira; menu longo: a faixa se repete em sequencia
            const n = itensVisiveis.length
            const cor =
              n > 1 && n <= PALETA_MENU.length
                ? PALETA_MENU[Math.round((posicao * (PALETA_MENU.length - 1)) / (n - 1))]
                : PALETA_MENU[posicao % PALETA_MENU.length]
            if (!item.ativo) {
              return (
                <span
                  key={item.chave}
                  className="cursor-not-allowed rounded-lg px-3 py-2 text-sm text-slate-500 opacity-50"
                >
                  {t(`itens.${item.chave}`)}
                </span>
              )
            }

            // Destaque do item ativo: rota atual === href do item, ou uma
            // sub-rota dele (ex.: /visualizar/123 mantem "Banco de imagens"
            // aceso quando aplicavel). Apenas leitura de rota - visual.
            const estaAtivo = pathname === item.href || pathname?.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.chave}
                href={item.href}
                aria-current={estaAtivo ? 'page' : undefined}
                onClick={item.chave === 'curadoria' ? aoClicarCuradoria : undefined}
                className={`rounded-lg border bg-linear-to-br px-3 py-2 text-sm font-medium transition-transform hover:-translate-y-0.5 ${cor} ${
                  estaAtivo ? 'ring-2 ring-brand ring-offset-2 ring-offset-base' : ''
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  {t(`itens.${item.chave}`)}
                  {item.chave === 'compartilhadasComigo' && novasCompartilhadas > 0 && (
                    <span
                      className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold leading-5 text-black"
                      aria-label={t('novasCompartilhadas', { quantidade: novasCompartilhadas })}
                    >
                      {novasCompartilhadas}
                    </span>
                  )}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-base-border px-3 py-4">
        <button
          type="button"
          onClick={handleSair}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-status-danger transition-colors hover:bg-red-950/40"
        >
          {t('sair')}
        </button>
      </div>
    </aside>
  )
}
