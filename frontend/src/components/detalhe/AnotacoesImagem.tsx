'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'

interface Anotacao {
  id: number
  curation_id: number
  texto: string
  cor: string
  tamanho_fonte: number
  negrito: boolean
  italico: boolean
  pos_x: number | null
  pos_y: number | null
  // Ponto pra onde a seta aponta. Quando null, a nota nao tem seta (foi
  // criada com um clique simples, sem arrastar).
  alvo_x: number | null
  alvo_y: number | null
  // Se true, a nota fica sempre visivel na imagem (nao so um marcador
  // pequeno que precisa ser clicado pra abrir).
  fixada: boolean
}

// Cores prontas pra escolher - a pessoa nao precisa digitar um codigo de
// cor, so clicar numa bolinha. Cada cor tem tambem uma "ponta de seta" (ver
// <defs> mais abaixo) pronta com essa mesma cor. `chave` referencia o
// namespace Visualizador.anotacoes.cores das mensagens de traducao.
const CORES_DISPONIVEIS = [
  { valor: '#facc15', chave: 'amarelo' },
  { valor: '#f87171', chave: 'vermelho' },
  { valor: '#4ade80', chave: 'verde' },
  { valor: '#60a5fa', chave: 'azul' },
  { valor: '#c084fc', chave: 'roxo' },
  { valor: '#fb923c', chave: 'laranja' },
]

const TAMANHOS_DISPONIVEIS = [12, 14, 16, 20, 24, 32]

// Distancia minima (em fracao da largura/altura, 0.0 a 1.0) pra um
// clique+solta ser considerado "arrastar" e ganhar uma seta. Abaixo disso
// conta como um clique simples (sem seta) - evita que a mao tremer um
// pouquinho ao clicar vire uma seta sem querer.
const LIMIAR_ARRASTO = 0.02

interface EstadoEdicao {
  id: number | null // null = anotacao nova (ainda nao salva); numero = editando uma existente
  posX: number
  posY: number
  alvoX: number | null
  alvoY: number | null
}

interface Props {
  curationId: number
  // Quando a fila de imagens esta visivel (tela cheia com mais de uma
  // imagem), ela ocupa uma faixa a esquerda - por isso o botao "+ Anotação"
  // (e o aviso R/I logo abaixo dele) precisam comecar mais pra direita
  // nesse caso, senao ficam escondidos atras da fila.
  filaVisivel?: boolean
}

function posicaoRelativa(retangulo: DOMRect, clientX: number, clientY: number) {
  const x = Math.min(1, Math.max(0, (clientX - retangulo.left) / retangulo.width))
  const y = Math.min(1, Math.max(0, (clientY - retangulo.top) / retangulo.height))
  return { x, y }
}

function idCorParaMarcador(cor: string) {
  return cor.replace('#', '')
}

// Caixa de anotacao pessoal: qualquer usuario pode marcar um ponto na
// imagem e escrever uma nota de estudo, escolhendo cor/tamanho/negrito/
// italico. Clicando e arrastando, a nota ganha uma seta ligando a caixa de
// texto ate o ponto exato apontado - e essa seta pode ser reajustada
// depois, clicando na ponta dela (que fica piscando) ou no botao ⠿ do
// meio. A nota tambem pode ficar "fixada" (sempre visivel na imagem) em vez
// de precisar clicar pra abrir. Cada anotacao e privada - so quem escreveu
// ve e edita a dela.
//
// Por que um botao "+ Anotação" em vez de so botao direito do mouse: o
// visualizador OHIF roda dentro de um iframe de outra origem, e por
// seguranca do navegador esta pagina NAO consegue detectar cliques feitos
// DENTRO dele (nem botao direito). Com o botao, ativa-se um "modo de
// anotar": uma camada transparente cobre a imagem inteira (inclusive o
// OHIF) so ate o proximo clique (ou arrastar) - depois volta ao normal, sem
// atrapalhar a rolagem/zoom do visualizador o resto do tempo.
export default function AnotacoesImagem({ curationId, filaVisivel }: Props) {
  const t = useTranslations('Visualizador.anotacoes')
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([])
  const [modoAdicionar, setModoAdicionar] = useState(false)
  const [editando, setEditando] = useState<EstadoEdicao | null>(null)
  const [texto, setTexto] = useState('')
  const [cor, setCor] = useState(CORES_DISPONIVEIS[0].valor)
  const [tamanhoFonte, setTamanhoFonte] = useState(14)
  const [negrito, setNegrito] = useState(false)
  const [italico, setItalico] = useState(false)
  const [fixada, setFixada] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastoInicio, setArrastoInicio] = useState<{ x: number; y: number } | null>(null)
  const [arrastandoAlvo, setArrastandoAlvo] = useState(false)
  const [arrastandoCaixa, setArrastandoCaixa] = useState(false)
  const [arrastandoSeta, setArrastandoSeta] = useState(false)
  // "Fotografia" de onde tudo estava quando o arrastar da seta INTEIRA
  // comecou - assim da pra calcular o deslocamento (delta) do mouse e
  // aplicar o mesmo delta nos dois pontos (caixa e ponta), mantendo o
  // formato da seta em vez de ir recalculando aos poucos (o que acumularia
  // erro de arredondamento).
  const [origemArrastoSeta, setOrigemArrastoSeta] = useState<{
    mouseX: number
    mouseY: number
    posX: number
    posY: number
    alvoX: number
    alvoY: number
  } | null>(null)
  // Guarda o retangulo (posicao/tamanho na tela) da camada de arrastar UMA
  // VEZ, quando o arrastar comeca, em vez de recalcular a cada movimento do
  // mouse. Recalcular com getBoundingClientRect() a cada movimento obriga o
  // navegador a re-medir a pagina inteira toda vez (o termo tecnico e
  // "reflow") - com o mouse se movendo dezenas de vezes por segundo, isso
  // deixa o arrastar visivelmente travado. Como essa camada nao muda de
  // tamanho/posicao enquanto o arrastar acontece, medir uma unica vez no
  // inicio e reaproveitar o valor resolve o travamento sem perder precisao.
  const retanguloArrastoRef = useRef<DOMRect | null>(null)
  const definirRetanguloArrasto = useCallback((elemento: HTMLDivElement | null) => {
    retanguloArrastoRef.current = elemento ? elemento.getBoundingClientRect() : null
  }, [])

  useEffect(() => {
    setModoAdicionar(false)
    setEditando(null)
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curationId])

  // Enquanto o usuario arrasta o puxador da seta OU a barra da caixa, uma
  // camada transparente cobre a imagem inteira (igual a do "+ Anotação",
  // mesmo motivo: o visualizador OHIF fica num iframe de outra origem, e o
  // navegador para de avisar esta pagina sobre o movimento do mouse assim
  // que o cursor passa por cima dele - so um elemento nosso, por cima de
  // tudo, garante que o arrastar continue funcionando a imagem toda.
  function moverDuranteArrasto(evento: MouseEvent<HTMLDivElement>) {
    // Usa o retangulo ja medido no inicio do arrastar (ver
    // definirRetanguloArrasto acima) - so mede de novo como plano B, caso
    // por algum motivo ele ainda nao tenha sido capturado.
    const retangulo = retanguloArrastoRef.current ?? evento.currentTarget.getBoundingClientRect()
    const { x, y } = posicaoRelativa(retangulo, evento.clientX, evento.clientY)
    setEditando((atual) => {
      if (!atual) return atual
      if (arrastandoAlvo) return { ...atual, alvoX: x, alvoY: y }
      if (arrastandoCaixa) return { ...atual, posX: x, posY: y }
      if (arrastandoSeta && origemArrastoSeta) {
        // Move a seta INTEIRA: acha o quanto o mouse andou desde o inicio
        // do arrastar (delta) e aplica esse mesmo delta nos dois pontos, pra
        // ela se deslocar mantendo o formato (nao mudar de angulo/tamanho).
        const deltaX = x - origemArrastoSeta.mouseX
        const deltaY = y - origemArrastoSeta.mouseY
        return {
          ...atual,
          posX: Math.min(1, Math.max(0, origemArrastoSeta.posX + deltaX)),
          posY: Math.min(1, Math.max(0, origemArrastoSeta.posY + deltaY)),
          alvoX: Math.min(1, Math.max(0, origemArrastoSeta.alvoX + deltaX)),
          alvoY: Math.min(1, Math.max(0, origemArrastoSeta.alvoY + deltaY)),
        }
      }
      return atual
    })
  }

  function finalizarArrastoAjuste() {
    setArrastandoAlvo(false)
    setArrastandoCaixa(false)
    setArrastandoSeta(false)
    setOrigemArrastoSeta(null)
  }

  // Clique na ponta da seta (a parte que pisca): um clique pega, ela passa
  // a seguir o mouse sozinha (sem precisar segurar), outro clique solta.
  function alternarArrastoAlvo(evento: MouseEvent<SVGLineElement>) {
    evento.preventDefault()
    evento.stopPropagation()
    setArrastandoAlvo((atual) => !atual)
  }

  // Logica compartilhada de "comecar a arrastar a seta inteira" - usada
  // tanto pelo traco invisivel em cima da linha (SVG) quanto pelo novo
  // botaozinho no meio da seta (HTML), que precisam calcular o retangulo de
  // referencia de formas diferentes (um usa o <svg> pai, o outro usa a
  // camada raiz do componente).
  function moverSetaInteiraDePonto(retangulo: DOMRect, clientX: number, clientY: number) {
    if (!editando || editando.alvoX === null || editando.alvoY === null) return
    const { x, y } = posicaoRelativa(retangulo, clientX, clientY)
    setOrigemArrastoSeta({
      mouseX: x,
      mouseY: y,
      posX: editando.posX,
      posY: editando.posY,
      alvoX: editando.alvoX,
      alvoY: editando.alvoY,
    })
    setArrastandoSeta(true)
  }

  // Igual ao clique na ponta da seta: um clique pega a seta inteira e ela
  // passa a seguir o mouse sem precisar segurar; um segundo clique solta.
  // Se ja estiver arrastando, o clique so encerra (nao recomeca do zero).
  function alternarArrastoSetaInteiraNaLinha(evento: MouseEvent<SVGLineElement>) {
    evento.preventDefault()
    evento.stopPropagation()
    if (arrastandoSeta) {
      finalizarArrastoAjuste()
      return
    }
    const retangulo = evento.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (retangulo) moverSetaInteiraDePonto(retangulo, evento.clientX, evento.clientY)
  }

  function alternarArrastoSetaInteiraNoBotao(evento: MouseEvent<HTMLButtonElement>) {
    evento.preventDefault()
    evento.stopPropagation()
    if (arrastandoSeta) {
      finalizarArrastoAjuste()
      return
    }
    const raiz = evento.currentTarget.closest('[data-anotacoes-raiz]') as HTMLElement | null
    const retangulo = raiz?.getBoundingClientRect()
    if (retangulo) moverSetaInteiraDePonto(retangulo, evento.clientX, evento.clientY)
  }

  async function carregar() {
    const token = localStorage.getItem('access_token')
    if (!token) return
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/annotations/${curationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resposta.ok) {
        const dados = await resposta.json()
        setAnotacoes(dados.itens ?? [])
      }
    } catch {
      // sem anotacoes carregadas, a imagem so fica sem marcadores - nao e critico
    }
  }

  function iniciarArrasto(evento: MouseEvent<HTMLDivElement>) {
    evento.preventDefault()
    const retangulo = evento.currentTarget.getBoundingClientRect()
    setArrastoInicio(posicaoRelativa(retangulo, evento.clientX, evento.clientY))
  }

  function finalizarArrasto(evento: MouseEvent<HTMLDivElement>) {
    evento.preventDefault()
    if (!arrastoInicio) return
    const retangulo = evento.currentTarget.getBoundingClientRect()
    const fim = posicaoRelativa(retangulo, evento.clientX, evento.clientY)
    const distancia = Math.hypot(fim.x - arrastoInicio.x, fim.y - arrastoInicio.y)
    const houveArrasto = distancia >= LIMIAR_ARRASTO

    setModoAdicionar(false)
    setTexto('')
    setCor(CORES_DISPONIVEIS[0].valor)
    setTamanhoFonte(14)
    setNegrito(false)
    setItalico(false)
    setFixada(false)
    setErro('')
    setEditando({
      id: null,
      posX: arrastoInicio.x,
      posY: arrastoInicio.y,
      alvoX: houveArrasto ? fim.x : null,
      alvoY: houveArrasto ? fim.y : null,
    })
    setArrastoInicio(null)
  }

  function abrirEdicao(anotacao: Anotacao) {
    setModoAdicionar(false)
    setTexto(anotacao.texto)
    setCor(anotacao.cor)
    setTamanhoFonte(anotacao.tamanho_fonte)
    setNegrito(anotacao.negrito)
    setItalico(anotacao.italico)
    setFixada(anotacao.fixada)
    setErro('')
    setEditando({
      id: anotacao.id,
      posX: anotacao.pos_x ?? 0.5,
      posY: anotacao.pos_y ?? 0.5,
      alvoX: anotacao.alvo_x,
      alvoY: anotacao.alvo_y,
    })
  }

  function adicionarSeta() {
    setEditando((atual) => {
      if (!atual) return atual
      return {
        ...atual,
        alvoX: Math.min(1, atual.posX + 0.1),
        alvoY: Math.max(0, atual.posY - 0.1),
      }
    })
  }

  function removerSeta() {
    setEditando((atual) => (atual ? { ...atual, alvoX: null, alvoY: null } : atual))
  }

  async function salvar() {
    const token = localStorage.getItem('access_token')
    if (!token || !editando) return
    const conteudo = texto.trim()
    if (!conteudo) {
      setErro(t('erroTextoVazio'))
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const corpo = {
        texto: conteudo,
        cor,
        tamanho_fonte: tamanhoFonte,
        negrito,
        italico,
        fixada,
        pos_x: editando.posX,
        pos_y: editando.posY,
        alvo_x: editando.alvoX,
        alvo_y: editando.alvoY,
      }
      const url = editando.id
        ? `${process.env.NEXT_PUBLIC_API_URL}/annotations/${editando.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/annotations/${curationId}`
      const resposta = await fetch(url, {
        method: editando.id ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      if (!resposta.ok) {
        setErro(t('erroSalvar'))
        return
      }
      const salva: Anotacao = await resposta.json()
      // Atualiza a lista na hora, usando a resposta do servidor, em vez de
      // buscar tudo de novo (GET) como antes - fica bem mais rapido, pois
      // economiza uma segunda ida-e-volta ao servidor.
      setAnotacoes((atual) => {
        const jaExiste = atual.some((a) => a.id === salva.id)
        return jaExiste ? atual.map((a) => (a.id === salva.id ? salva : a)) : [...atual, salva]
      })
      setEditando(null)
    } catch {
      setErro(t('erroSalvar'))
    } finally {
      setSalvando(false)
    }
  }

  async function removerAnotacao(id: number) {
    const token = localStorage.getItem('access_token')
    if (!token) return
    setSalvando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/annotations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resposta.ok) {
        setErro(t('erroExcluir'))
        return
      }
      setAnotacoes((atual) => atual.filter((a) => a.id !== id))
    } catch {
      setErro(t('erroExcluir'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0" data-anotacoes-raiz>
      <button
        type="button"
        onClick={() => {
          setEditando(null)
          setModoAdicionar((atual) => !atual)
        }}
        className={`pointer-events-auto absolute bottom-24 z-50 rounded-lg border px-3 py-1.5 text-xs font-medium backdrop-blur transition ${
          filaVisivel ? 'left-[300px] sm:left-[364px]' : 'left-3 sm:left-6'
        } ${
          modoAdicionar
            ? 'border-brand bg-brand text-white'
            : 'border-base-border bg-black/60 text-white/90 hover:border-brand hover:text-brand-300'
        }`}
      >
        {modoAdicionar ? t('cancelar') : t('novaAnotacao')}
      </button>

      {modoAdicionar && (
        <div
          onMouseDown={iniciarArrasto}
          onMouseUp={finalizarArrasto}
          onContextMenu={(evento) => evento.preventDefault()}
          className="pointer-events-auto absolute inset-0 z-40 cursor-crosshair bg-black/10"
          title={t('dicaClicarArrastar')}
        />
      )}

      {/* Camada de captura do arrasto (puxador da seta ou barra da caixa) -
          precisa cobrir a imagem inteira pelo mesmo motivo do overlay acima,
          senão o arrastar trava assim que o mouse passa por cima do OHIF. */}
      {(arrastandoAlvo || arrastandoCaixa || arrastandoSeta) && (
        <div
          ref={definirRetanguloArrasto}
          onMouseMove={moverDuranteArrasto}
          onMouseUp={finalizarArrastoAjuste}
          onMouseLeave={finalizarArrastoAjuste}
          className="pointer-events-auto absolute inset-0 z-[55] cursor-move"
        />
      )}

      {/* Camada das setas - fica entre a imagem e os marcadores/caixa. */}
      <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
        <defs>
          {CORES_DISPONIVEIS.map((c) => (
            <marker
              key={c.valor}
              id={`seta-ponta-${idCorParaMarcador(c.valor)}`}
              markerWidth={8}
              markerHeight={8}
              refX={6}
              refY={4}
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill={c.valor} />
            </marker>
          ))}
        </defs>

        {anotacoes.map(
          (anotacao) =>
            anotacao.pos_x !== null &&
            anotacao.pos_y !== null &&
            anotacao.alvo_x !== null &&
            anotacao.alvo_y !== null && (
              <line
                key={`seta-${anotacao.id}`}
                x1={`${anotacao.pos_x * 100}%`}
                y1={`${anotacao.pos_y * 100}%`}
                x2={`${anotacao.alvo_x * 100}%`}
                y2={`${anotacao.alvo_y * 100}%`}
                stroke={anotacao.cor}
                strokeWidth={2}
                markerEnd={`url(#seta-ponta-${idCorParaMarcador(anotacao.cor)})`}
              />
            )
        )}

        {/* Previa da seta enquanto a nota ainda esta sendo escrita/editada/ajustada. */}
        {editando && editando.alvoX !== null && editando.alvoY !== null && (
          <>
            {/* Faixa larga e INVISIVEL por cima do traco da seta, so pra
                facilitar clicar nela (o traco visual tem so 2px - dificil de
                acertar exatamente). Clicar e arrastar aqui move a seta
                INTEIRA (caixa + ponta juntas, mantendo o formato). */}
            <line
              x1={`${editando.posX * 100}%`}
              y1={`${editando.posY * 100}%`}
              x2={`${editando.alvoX * 100}%`}
              y2={`${editando.alvoY * 100}%`}
              stroke="transparent"
              strokeWidth={18}
              onClick={alternarArrastoSetaInteiraNaLinha}
              className={arrastandoSeta ? 'pointer-events-none cursor-move' : 'pointer-events-auto cursor-pointer'}
            />
            {/* Traco pontilhado da seta - a ponta (com a setinha) NAO fica
                aqui mais, e sim nos dois elementos abaixo, pra poder piscar
                so ela, sem piscar a linha inteira. */}
            <line
              x1={`${editando.posX * 100}%`}
              y1={`${editando.posY * 100}%`}
              x2={`${editando.alvoX * 100}%`}
              y2={`${editando.alvoY * 100}%`}
              stroke={cor}
              strokeWidth={2}
              strokeDasharray="4 3"
            />

            {/* Faixa larga e INVISIVEL so nos ultimos 15% perto da ponta -
                clicar aqui e o jeito de "pegar" a ponta (um clique pega,
                outro clique solta - igual ao botao do meio da seta).
                Fica pointer-events-none enquanto arrasta, pelo mesmo motivo
                dos outros: nao pode atrapalhar a camada de arrastar que
                cobre a imagem inteira por baixo. */}
            <line
              x1={`${(editando.posX + (editando.alvoX - editando.posX) * 0.85) * 100}%`}
              y1={`${(editando.posY + (editando.alvoY - editando.posY) * 0.85) * 100}%`}
              x2={`${editando.alvoX * 100}%`}
              y2={`${editando.alvoY * 100}%`}
              stroke="transparent"
              strokeWidth={18}
              onClick={alternarArrastoAlvo}
              className={arrastandoAlvo ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}
            />

            {/* A ponta de verdade (com a setinha), desenhada como um
                traçinho curto separado - so ela pisca (animate-pulse), pra
                chamar atenção de que dá pra clicar e arrastar sem precisar
                de um circulo desenhado por cima. */}
            <line
              x1={`${(editando.posX + (editando.alvoX - editando.posX) * 0.85) * 100}%`}
              y1={`${(editando.posY + (editando.alvoY - editando.posY) * 0.85) * 100}%`}
              x2={`${editando.alvoX * 100}%`}
              y2={`${editando.alvoY * 100}%`}
              stroke={cor}
              strokeWidth={2}
              markerEnd={`url(#seta-ponta-${idCorParaMarcador(cor)})`}
              className="pointer-events-none animate-pulse"
            />
          </>
        )}
      </svg>

      {anotacoes.map((anotacao) => {
        if (anotacao.pos_x === null || anotacao.pos_y === null) return null
        const esquerda = `${anotacao.pos_x * 100}%`
        const topo = `${anotacao.pos_y * 100}%`

        if (anotacao.fixada) {
          // Nota "fixada": mostra o texto direto na imagem, no estilo
          // escolhido, sem precisar clicar pra abrir.
          return (
            <div
              key={anotacao.id}
              className="group pointer-events-auto absolute z-30 max-w-[220px] -translate-x-1/2 -translate-y-1/2"
              style={{ left: esquerda, top: topo }}
            >
              <button
                type="button"
                onClick={() => abrirEdicao(anotacao)}
                title={t('clicarParaEditar')}
                style={{
                  color: anotacao.cor,
                  fontSize: `${anotacao.tamanho_fonte}px`,
                  fontWeight: anotacao.negrito ? 700 : 400,
                  fontStyle: anotacao.italico ? 'italic' : 'normal',
                }}
                className="block max-w-[220px] break-words rounded-lg border border-white/20 bg-black/70 px-2 py-1 text-left shadow-lg backdrop-blur-sm"
              >
                {anotacao.texto}
              </button>
              <button
                type="button"
                onClick={(evento) => {
                  evento.stopPropagation()
                  removerAnotacao(anotacao.id)
                }}
                title={t('excluirAnotacao')}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white group-hover:flex"
              >
                ×
              </button>
            </div>
          )
        }

        return (
          <div
            key={anotacao.id}
            className="group pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: esquerda, top: topo }}
          >
            <button
              type="button"
              onClick={() => abrirEdicao(anotacao)}
              title={anotacao.texto}
              style={{ backgroundColor: anotacao.cor }}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/80 text-xs shadow-lg transition hover:scale-125"
            >
              📝
            </button>
            <button
              type="button"
              onClick={(evento) => {
                evento.stopPropagation()
                removerAnotacao(anotacao.id)
              }}
              title={t('excluirAnotacao')}
              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white group-hover:flex"
            >
              ×
            </button>
          </div>
        )
      })}

      {/* Botaozinho de arrastar a seta INTEIRA, no mesmo estilo do "x" de
          excluir (circulo pequeno, sempre visivel enquanto a caixa de
          edicao esta aberta). Um clique pega (caixa + ponta se movem
          juntas, sem precisar segurar o botao), outro clique solta.
          A PONTA da seta nao tem mais um botao/circulo proprio - agora e a
          propria ponta (a setinha) que pisca na imagem, e o clique pra
          pegar/soltar ela e feito direto em cima dela (ver o bloco
          "Previa da seta" mais acima, dentro do <svg>). */}
      {editando && editando.alvoX !== null && editando.alvoY !== null && (
        <button
          type="button"
          onClick={alternarArrastoSetaInteiraNoBotao}
          title={arrastandoSeta ? t('soltarSeta') : t('pegarSeta')}
          style={{
            left: `${((editando.posX + editando.alvoX) / 2) * 100}%`,
            top: `${((editando.posY + editando.alvoY) / 2) * 100}%`,
          }}
          // pointer-events-none enquanto arrasta: deixa os cliques/
          // movimentos atravessarem direto pra camada de arrastar por
          // baixo, em vez de ficarem presos nesse circulo pequeno que fica
          // sempre embaixo do cursor.
          className={`absolute z-[60] flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/70 text-[10px] leading-none text-white shadow-lg ${
            arrastandoSeta ? 'pointer-events-none scale-125 cursor-move' : 'pointer-events-auto cursor-pointer'
          }`}
        >
          ⠿
        </button>
      )}

      {editando && (
        <div
          style={{ left: `${editando.posX * 100}%`, top: `${editando.posY * 100}%` }}
          // bg-base-surface/10: quase todo transparente, so o suficiente pra
          // ainda dar pra ler o texto - a seta e a imagem por tras ficam bem
          // visiveis atraves do painel.
          className="pointer-events-auto absolute z-50 w-64 -translate-x-1/2 rounded-xl border border-base-border bg-base-surface/10 p-3 shadow-2xl backdrop-blur-sm"
        >
          {/* Fecha a caixa sem salvar - mesmo estilo do "x" usado pra excluir
              um marcador (circulo pequeno no canto), so que aqui a acao e
              so fechar/descartar a edicao, nao apagar a anotacao salva. */}
          <button
            type="button"
            onClick={() => setEditando(null)}
            title={t('fecharSemSalvar')}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/40 bg-black/70 text-xs font-bold leading-none text-white shadow-lg hover:border-red-400 hover:text-red-400"
          >
            ×
          </button>

          {/* Barra de arrastar: quando a caixa abre perto da borda da tela e
              algum botão fica escondido, arraste esta barra para mover a
              caixa inteira para um lugar visível. */}
          <div
            onMouseDown={(evento) => {
              evento.preventDefault()
              setArrastandoCaixa(true)
            }}
            title={t('arrasteTitulo')}
            className="-mx-3 -mt-3 mb-2 flex cursor-move items-center justify-center gap-1 rounded-t-xl border-b border-base-border bg-base-surface2 py-1 text-[10px] text-ink-2"
          >
            {t('arrasteMoverCaixa')}
          </div>

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
            rows={3}
            placeholder={t('placeholder')}
            style={{
              color: cor,
              fontSize: `${tamanhoFonte}px`,
              fontWeight: negrito ? 700 : 400,
              fontStyle: italico ? 'italic' : 'normal',
            }}
            className="w-full resize-none rounded-lg border border-base-border bg-base-surface2/10 p-2 backdrop-blur-sm"
          />

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {CORES_DISPONIVEIS.map((c) => (
              <button
                key={c.valor}
                type="button"
                onClick={() => setCor(c.valor)}
                aria-label={t(`cores.${c.chave}`)}
                title={t(`cores.${c.chave}`)}
                style={{ backgroundColor: c.valor }}
                className={`h-5 w-5 rounded-full border-2 transition ${
                  cor === c.valor ? 'border-ink' : 'border-transparent'
                }`}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <select
              value={tamanhoFonte}
              onChange={(e) => setTamanhoFonte(Number(e.target.value))}
              className="rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink"
            >
              {TAMANHOS_DISPONIVEIS.map((t) => (
                <option key={t} value={t}>
                  {t}px
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setNegrito((v) => !v)}
              aria-pressed={negrito}
              title={t('negrito')}
              className={`h-7 w-7 rounded-lg border text-sm font-bold ${
                negrito ? 'border-brand bg-brand/10 text-brand-300' : 'border-base-border text-ink-2'
              }`}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => setItalico((v) => !v)}
              aria-pressed={italico}
              title={t('italico')}
              className={`h-7 w-7 rounded-lg border text-sm italic ${
                italico ? 'border-brand bg-brand/10 text-brand-300' : 'border-base-border text-ink-2'
              }`}
            >
              I
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <input
                type="checkbox"
                checked={fixada}
                onChange={(e) => setFixada(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              {t('textoSempreVisivel')}
            </label>
            {editando.alvoX !== null && editando.alvoY !== null ? (
              <button
                type="button"
                onClick={removerSeta}
                className="rounded-lg border border-base-border px-2 py-1 text-[11px] text-ink-2 hover:border-red-400 hover:text-red-400"
              >
                {t('removerSeta')}
              </button>
            ) : (
              <button
                type="button"
                onClick={adicionarSeta}
                className="rounded-lg border border-base-border px-2 py-1 text-[11px] text-ink-2 hover:border-brand hover:text-brand-300"
              >
                {t('adicionarSeta')}
              </button>
            )}
          </div>
          {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

          <div className="mt-3">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {salvando ? t('salvando') : t('salvar')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
