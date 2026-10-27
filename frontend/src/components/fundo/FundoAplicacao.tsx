'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import FundoMapaMundi from './FundoMapaMundi'
import type { IntensidadeFundo } from './motorMapaMundi'
import { regiaoDe } from '../../lib/regiaoGeografica'

// Padrao visual unico do RADIX IMAGO: o mapa-mundi em pontos (identidade do
// globo da tela de entrada) fica atras de TODAS as telas, montado uma vez
// so no layout raiz. Cada tela recebe um modo conforme o que ela exige:
//
//   vivo     -> telas de navegacao/entrada: todos os efeitos.
//   leitura  -> telas de trabalho (tabelas, formularios, relatorios): o
//               mapa fica bem discreto e os paineis de conteudo ficam quase
//               opacos, para a leitura vir sempre em primeiro lugar.
//   nenhum   -> so a tela de entrada (que tem o proprio globo).
//
// Telas com imagens (Curadoria, Visualizar, Segunda opiniao) usam o modo
// leitura: o mapa discreto aparece so na moldura em volta dos paineis; a
// area da radiografia em si continua PRETA e parada (o visualizador tem
// fundo proprio), que e o padrao para leitura de imagem - brilho ou
// movimento atras da radiografia atrapalharia a percepcao de contraste.
//
// Para mudar o modo de uma tela, basta ajustar as listas abaixo.

type Modo = IntensidadeFundo | 'nenhum'

const SEM_FUNDO = ['/login']
const VIVO = ['/conheca', '/banco-imagens', '/acesso-negado', '/esqueci-senha', '/redefinir-senha', '/solicitar-acesso', '/confirmar-email']
// Telas publicas desenhadas so para fundo escuro (texto branco sobre vidro)
const SEMPRE_ESCURO = ['/esqueci-senha', '/redefinir-senha', '/solicitar-acesso', '/confirmar-email']
// Telas que mostram a leitura do hemisferio no canto
// (27/10/2026) so a tela de login mostra o hemisferio - e ela tem a propria
// leitura (login/page.tsx); nas demais telas a caixa nao aparece mais
const COM_HEMISFERIO: string[] = []

const casa = (rota: string, lista: string[]) =>
  lista.some((r) => (r === '/' ? rota === '/' : rota === r || rota.startsWith(`${r}/`)))

function modoDaRota(rota: string): Modo {
  if (casa(rota, SEM_FUNDO)) return 'nenhum'
  if (casa(rota, VIVO)) return 'vivo'
  return 'leitura'
}

export default function FundoAplicacao() {
  const rota = usePathname() || '/'
  const t = useTranslations('Login')
  const modo = modoDaRota(rota)
  const escuroForcado = casa(rota, SEMPRE_ESCURO)
  const [longitude, setLongitude] = useState<number | null>(null)

  // Marca o <html> com o modo atual: os estilos de ESTILO_PADRAO so valem
  // quando o mapa esta ligado (sem ele, as telas ficam exatamente como antes).
  useEffect(() => {
    const html = document.documentElement
    if (modo === 'nenhum') delete html.dataset.fundo
    else html.dataset.fundo = modo
    if (escuroForcado) html.dataset.fundoEscuro = ''
    else delete html.dataset.fundoEscuro
  }, [modo, escuroForcado])

  // As classes do padrao (titulo-pagina etc.) valem em todas as telas,
  // inclusive nas sem mapa - por isso ESTILO_COMPONENTES vai sempre.
  // Qualquer link para a Curadoria (menu lateral, "Revisar agora" do
  // Inicio, etc.) pede tela cheia NO PROPRIO CLIQUE - o navegador so aceita
  // entrar em tela cheia durante uma acao do usuario, entao esse e o unico
  // momento confiavel. A navegacao segue normalmente (o <html> continua o
  // mesmo entre telas, entao a tela cheia sobrevive a troca de rota).
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      const alvo = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!alvo || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const caminho = new URL(alvo.href, window.location.href).pathname
      if (caminho !== '/curadoria' || document.fullscreenElement) return
      document.documentElement.requestFullscreen?.().catch(() => {})
    }
    document.addEventListener('click', aoClicar, true)
    return () => document.removeEventListener('click', aoClicar, true)
  }, [])

  if (modo === 'nenhum') return <style dangerouslySetInnerHTML={{ __html: ESTILO_COMPONENTES }} />

  const mostrarHemisferio = casa(rota, COM_HEMISFERIO) && longitude !== null

  return (
    <>
      <FundoMapaMundi intensidade={modo} forcarEscuro={escuroForcado} aoMudarLongitude={setLongitude} />
      {mostrarHemisferio && longitude !== null && (
        <p
          aria-hidden="true"
          className="painel-vidro pointer-events-none fixed bottom-5 right-5 z-20 hidden rounded-xl px-4 py-2.5 text-right font-mono text-[11px] uppercase leading-relaxed tracking-wider text-ink-2 lg:block"
        >
          {t('hemisferio')}{' '}
          <b className="font-semibold text-teal-700 dark:text-teal-300">{longitude < 0 ? t('ocidental') : t('oriental')}</b>
          <br />
          {t(regiaoDe(longitude))} · <span className="tabular-nums">{Math.abs(longitude)}°{longitude < 0 ? 'W' : 'E'}</span>
        </p>
      )}
      <style dangerouslySetInnerHTML={{ __html: ESTILO_PADRAO + ESTILO_COMPONENTES }} />
    </>
  )
}

// Regras globais do padrao visual, ativas so com o mapa ligado
// (html[data-fundo]). Ficam aqui, num lugar so, para valer em todas as
// telas sem precisar mexer em cada componente.
const ESTILO_PADRAO = `
/* 0. LEGIBILIDADE E CONFORTO VISUAL (vale para todas as telas com o mapa)
      - letra ~6% maior em todo o sistema (16px -> 17px de base);
      - MODO NOTURNO "suave" (pedido de 2026-10: a tela escura estava clara
        demais e cansava a vista): fundo e paineis mais escuros e com pouca
        saturacao, e o texto principal deixa de ser branco puro (cinza-gelo
        #dee4ec). Branco puro sobre fundo escuro "ofusca" e cria halo nas
        letras (efeito halation); tons suaves reduzem o brilho total da
        tela sem perder leitura. O contraste continua alto: texto principal
        ~13:1 e o texto mais apagado ~5:1 (acima do minimo 4,5:1 da WCAG AA,
        recomendacao internacional de acessibilidade);
      - no tema claro, os cinzas claros demais ficam um tom mais escuros. */
html[data-fundo]{font-size:106.25%}
html[data-fundo]:not(.light){
  --rgb-base: 11 15 19;
  --rgb-base-surface: 21 27 34;
  --rgb-base-surface2: 28 35 44;
  --rgb-base-border: 44 54 67;
  --rgb-ink: 222 228 236;
  --rgb-ink-2: 196 205 217;
  --rgb-ink-3: 156 168 186;
  --rgb-ink-4: 128 142 162;
}
html.light[data-fundo]{
  --rgb-base-border: 212 219 229;
  --rgb-ink-2: 30 41 59;
  --rgb-ink-3: 71 85 105;
  --rgb-ink-4: 100 116 139;
}

/* 1. Fundo da pagina transparente (o mapa aparece) - inclui as telas de "carregando" */
html[data-fundo] .min-h-screen.bg-base{background-color:transparent}
html[data-fundo] .h-screen.bg-base{background-color:transparent}

/* 2. Menu lateral (solido, como sempre foi) e barra do topo fixos ao rolar */
html[data-fundo] aside.bg-base{position:sticky;top:0}
html[data-fundo] header.bg-base{
  position:sticky;top:0;z-index:15;
  background-color:rgb(var(--rgb-base) / .5);
  backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%);
  border-color:rgb(var(--rgb-base-border) / .6);
}

/* 2b. Halo na cor do fundo em volta das letras: o texto que fica direto
       sobre o mapa (subtitulos, mensagens de "nenhum item") "apaga" os
       pontos logo atras de cada letra. Dentro dos paineis o halo tem a
       mesma cor do painel, entao nao aparece. */
html[data-fundo="leitura"] main{--halo:rgb(var(--rgb-base));text-shadow:0 0 1px var(--halo),0 0 3px var(--halo),0 0 5px var(--halo),0 0 8px var(--halo),0 0 12px var(--halo)}
html[data-fundo="leitura"] main .titulo-pagina,html[data-fundo="leitura"] main .titulo-pagina *{text-shadow:none}
html[data-fundo="leitura"] main :is(button,a,input,select,textarea)[class*="bg-"]{text-shadow:none}

/* 3. Paineis de conteudo (cartoes, tabelas, formularios): vidro QUASE
      opaco - o mapa so "respira" pelas bordas e nunca fica atras do texto
      com forca. No modo leitura, ainda mais opacos. */
html[data-fundo] .bg-base-surface{
  background-color:rgb(var(--rgb-base-surface) / .84);
  backdrop-filter:blur(10px) saturate(130%);-webkit-backdrop-filter:blur(10px) saturate(130%);
}
html[data-fundo="leitura"] .bg-base-surface{background-color:rgb(var(--rgb-base-surface) / .92)}
/* cartoes e botoes com gradiente translucido (ex.: "dark:from-teal-600/30")
   ganham um fundo solido por baixo do gradiente - sem isso os pontos do
   mapa apareceriam atras do texto */
html[data-fundo] .bg-linear-to-br,html[data-fundo] .bg-linear-to-r{background-color:rgb(var(--rgb-base-surface) / .9)}
/* avisos e caixas coloridas translucidas (ex.: "bg-yellow-500/10" com
   borda): o desfoque transforma os pontos do mapa num fundo liso por tras
   do texto, mantendo a cor do aviso */
html[data-fundo] [class*="rounded"][class*="border"][class*=" bg-"][class*="/10"],
html[data-fundo] [class*="rounded"][class*="border"][class*=" bg-"][class*="/20"],
html[data-fundo] [class*="rounded"][class*="border"][class*=" bg-"][class*="/30"]{
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
}

/* 5. Tema claro: varios textos coloridos foram desenhados so para o tema
      escuro (ex.: "text-amber-200" num aviso) e ficavam apagados sobre
      fundo claro. Aqui eles ganham o tom escuro equivalente (contraste
      adequado para leitura). Nao vale nas telas sempre escuras. */
html.light[data-fundo]:not([data-fundo-escuro]) :is(.text-red-200,.text-red-300,.text-red-400){color:#b91c1c}
html.light[data-fundo]:not([data-fundo-escuro]) :is(.text-emerald-300,.text-emerald-400){color:#047857}
html.light[data-fundo]:not([data-fundo-escuro]) :is(.text-amber-200,.text-amber-300,.text-amber-400){color:#92400e}
html.light[data-fundo]:not([data-fundo-escuro]) :is(.text-purple-200,.text-purple-300){color:#7e22ce}
html.light[data-fundo]:not([data-fundo-escuro]) :is(.text-teal-100,.text-teal-200,.text-teal-300){color:#0f766e}
html.light[data-fundo]:not([data-fundo-escuro]) :is(.text-sky-200,.text-sky-300){color:#0369a1}
html.light[data-fundo]:not([data-fundo-escuro]) [class*="text-teal-100/"]{color:rgb(15 118 110 / .85)}
html.light[data-fundo]:not([data-fundo-escuro]) .text-orange-300{color:#c2410c}
html.light[data-fundo]:not([data-fundo-escuro]) :is(.text-blue-300,.text-blue-400){color:#1d4ed8}

/* 6. MODO ESCURO CONFORTAVEL (pedido de 2026-10: "ajustar o brilho para
      cansar menos a vista"). No escuro, o que cansa nao e o fundo, e sim o
      que BRILHA sobre ele: cores muito vivas (saturadas), azul forte nos
      botoes e caixinhas brancas (checkbox) que acendem como lampadas.
      Aqui as cores continuam as mesmas (cada uma ainda identifica a sua
      categoria), mas em versoes menos saturadas e menos luminosas - todas
      ainda com contraste acima de 7:1 sobre os paineis (WCAG AAA). */
html.dark[data-fundo]{
  --rgb-brand: 46 88 178;
  --rgb-brand-hover: 58 104 200;
  --rgb-brand-300: 125 160 214;
}
/* menu lateral e campos de formulario coloridos: mesma cor, mais apagada */
html.dark[data-fundo] aside nav a{filter:saturate(.55) brightness(.88)}
html.dark[data-fundo] main :is(select,input:not([type=checkbox]):not([type=radio]),textarea){filter:saturate(.55) brightness(.95)}
/* textos coloridos vivos -> tons suaves equivalentes */
html.dark[data-fundo] .text-teal-200{color:#a9d6ce}
html.dark[data-fundo] .text-teal-300{color:#7fc4b8}
html.dark[data-fundo] :is(.text-emerald-200,.text-emerald-300,.text-emerald-400){color:#86c5a3}
html.dark[data-fundo] :is(.text-amber-200,.text-amber-300,.text-amber-400){color:#dcc086}
html.dark[data-fundo] :is(.text-blue-300,.text-blue-400,.text-sky-200,.text-sky-300,.text-cyan-300,.text-indigo-300){color:#98b3d8}
html.dark[data-fundo] :is(.text-purple-200,.text-purple-300,.text-purple-400,.text-violet-300){color:#b9a8d6}
html.dark[data-fundo] :is(.text-red-200,.text-red-300,.text-red-400,.text-rose-300){color:#e08f8f}
html.dark[data-fundo] :is(.text-orange-200,.text-orange-300){color:#dba984}
html.dark[data-fundo] :is(.text-lime-300,.text-green-300,.text-yellow-300){color:#b9cc8e}
`

// Classes reutilizaveis do padrao visual (titulo das telas, painel de vidro,
// animacao de entrada). Valem com ou sem o mapa ligado.
const ESTILO_COMPONENTES = `
.painel-vidro{
  background:rgba(255,255,255,.66);
  border:1px solid rgba(15,23,42,.08);
  backdrop-filter:blur(12px) saturate(140%);-webkit-backdrop-filter:blur(12px) saturate(140%);
}
.dark .painel-vidro{background:rgba(7,11,16,.58);border-color:rgba(255,255,255,.08)}
.titulo-pagina{
  font-size:1.75rem;line-height:1.15;font-weight:600;letter-spacing:-.02em;
  background:linear-gradient(100deg,#0f172a 0%,#0f766e 60%,#0d9488 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.dark .titulo-pagina{background-image:linear-gradient(100deg,#d8dee6 0%,#bcdcd6 45%,#62bfae 100%)}
@media (min-width:640px){.titulo-pagina{font-size:2rem}}
.titulo-pagina--grande{font-size:2.25rem}
@media (min-width:640px){.titulo-pagina--grande{font-size:3rem}}
.texto-legivel{--halo:rgb(var(--rgb-base));text-shadow:0 0 1px var(--halo),0 0 3px var(--halo),0 0 6px var(--halo),0 0 10px var(--halo),0 0 16px var(--halo)}
.dark .texto-legivel{--halo:rgba(0,0,0,.95)}
.tela-entra{animation:telaEntra .6s cubic-bezier(.2,.8,.2,1) backwards}
@keyframes telaEntra{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.tela-entra{animation:none}}
`
