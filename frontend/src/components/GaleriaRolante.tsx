'use client'

import { useTranslations } from 'next-intl'

// Galeria "esteira" da pagina inicial: as mesmas imagens ilustrativas da
// tela de entrada (geradas por IA, sem dados de pacientes - LGPD) correndo
// numa faixa unica, bem devagar. Uma faixa so (e nao duas) para que nenhuma
// imagem apareca repetida na tela ao mesmo tempo.
//
// Padrao usado por sites de referencia (vitrines continuas): movimento
// lento e constante, bordas que se dissolvem, pausa ao passar o mouse e
// nenhuma informacao importante dependendo do movimento. Com "reduzir
// movimento" ligado no sistema, as faixas ficam paradas e podem ser
// roladas com o dedo/mouse.

interface ItemGaleria {
  arquivo: string
  chaveTitulo: string
  chaveArea: string
  cor: string
}

// Mesma ordem e mesmas cores de area da tela de entrada (login/page.tsx)
const ITENS: ItemGaleria[] = [
  { arquivo: 'rm', chaveTitulo: 'rm', chaveArea: 'areaRadiologia', cor: '#14B8A6' },
  { arquivo: 'tc', chaveTitulo: 'tc', chaveArea: 'areaRadiologia', cor: '#3B82F6' },
  { arquivo: 'cardio', chaveTitulo: 'cardio', chaveArea: 'areaAnatomia', cor: '#EF4444' },
  { arquivo: 'rxodonto', chaveTitulo: 'rxodonto', chaveArea: 'areaOdontologia', cor: '#F97316' },
  { arquivo: 'celulas', chaveTitulo: 'celulas', chaveArea: 'areaBiologia', cor: '#A855F7' },
  { arquivo: 'arvore', chaveTitulo: 'arvore', chaveArea: 'areaFlora', cor: '#22C55E' },
  { arquivo: 'cao', chaveTitulo: 'cao', chaveArea: 'areaFauna', cor: '#EAB308' },
]

function Cartao({ item, numero, decorativo }: { item: ItemGaleria; numero: number; decorativo: boolean }) {
  const t = useTranslations('Inicio.galeria')
  const tArea = useTranslations('Login')
  const titulo = t(`itens.${item.chaveTitulo}` as Parameters<typeof t>[0])

  return (
    <figure
      className="galeria-cartao group relative aspect-video w-[300px] shrink-0 overflow-hidden rounded-2xl sm:w-[420px] lg:w-[500px]"
      style={{ ['--cor' as string]: item.cor }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/login/${item.arquivo}.webp`}
        alt={decorativo ? '' : t('altImagem', { titulo })}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
      {/* escurece a base para a legenda ficar legivel */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <span>
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.16em] text-white/70">
            <span className="galeria-ponto h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            {tArea(item.chaveArea as Parameters<typeof tArea>[0])}
          </span>
          <span className="mt-1 block text-[15px] font-semibold text-white">{titulo}</span>
        </span>
        <span className="font-mono text-[11px] tracking-widest text-white/50" aria-hidden="true">
          {String(numero).padStart(2, '0')}
        </span>
      </figcaption>
    </figure>
  )
}

function Faixa({ indices, sentido, duracao }: { indices: number[]; sentido: 'esquerda' | 'direita'; duracao: number }) {
  // A lista e repetida duas vezes: quando a primeira copia sai inteira da
  // tela, a segunda esta exatamente no lugar dela - o "loop" fica invisivel.
  return (
    <div className="galeria-faixa">
      <div
        className={`galeria-trilho flex w-max gap-5 ${sentido === 'direita' ? 'galeria-trilho--direita' : ''}`}
        style={{ animationDuration: `${duracao}s` }}
      >
        {[0, 1].map((copia) => (
          <div key={copia} className="flex gap-5" aria-hidden={copia === 1 ? true : undefined}>
            {indices.map((i) => (
              <Cartao key={`${copia}-${i}`} item={ITENS[i]} numero={i + 1} decorativo={copia === 1} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GaleriaRolante() {
  const t = useTranslations('Inicio.galeria')
  const tLogin = useTranslations('Login')

  return (
    // Sai da coluna central e ocupa a largura inteira da janela
    <section aria-labelledby="galeria-titulo" className="relative left-1/2 w-screen -translate-x-1/2 py-8">
      <div className="texto-legivel mx-auto mb-7 flex max-w-5xl flex-col gap-1 px-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.22em] text-teal-700 dark:text-teal-300">{t('rotulo')}</p>
          <h2 id="galeria-titulo" className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">
            {t('titulo')}
          </h2>
        </div>
        <p className="max-w-sm text-sm text-slate-400 sm:text-right">{t('subtitulo')}</p>
      </div>

      <Faixa indices={[0, 1, 2, 3, 4, 5, 6]} sentido="esquerda" duracao={75} />

      <p className="mx-auto mt-6 flex max-w-5xl px-6 text-xs text-slate-400">
        <span className="painel-vidro inline-flex items-center gap-2 rounded-full px-3.5 py-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" />
        </svg>
        {tLogin('avisoIA')}
        </span>
      </p>

      <style dangerouslySetInnerHTML={{ __html: ESTILO }} />
    </section>
  )
}

const ESTILO = `
.galeria-faixa{
  overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 9%,#000 91%,transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 9%,#000 91%,transparent 100%);
}
.galeria-trilho{animation:galeriaEsquerda linear infinite;will-change:transform}
.galeria-trilho--direita{animation-name:galeriaDireita}
/* pausa ao passar o mouse ou ao navegar pelo teclado */
.galeria-faixa:hover .galeria-trilho,.galeria-faixa:focus-within .galeria-trilho{animation-play-state:paused}
@keyframes galeriaEsquerda{from{transform:translateX(0)}to{transform:translateX(calc(-50% - 10px))}}
@keyframes galeriaDireita{from{transform:translateX(calc(-50% - 10px))}to{transform:translateX(0)}}
.galeria-cartao{
  border:1px solid rgba(255,255,255,.08);
  background:#05080c;
  box-shadow:0 18px 40px -22px rgba(0,0,0,.9);
  transition:border-color .4s, box-shadow .4s, transform .4s;
}
.galeria-cartao:hover{
  border-color:color-mix(in srgb, var(--cor) 60%, transparent);
  box-shadow:0 0 0 1px color-mix(in srgb, var(--cor) 30%, transparent), 0 24px 50px -22px color-mix(in srgb, var(--cor) 70%, transparent);
}
.galeria-ponto{background:var(--cor);box-shadow:0 0 8px var(--cor)}
@media (prefers-reduced-motion: reduce){
  .galeria-trilho{animation:none}
  .galeria-faixa{overflow-x:auto}
}
`
