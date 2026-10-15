'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { FormularioFicha } from './FichaCuradoriaForm'
import {
  escolherSugestaoPorVoz,
  interpretar,
  itemResolvidoPelaFala,
  type Alteracao,
  type CampoVoz,
  type MacroVoz,
  type NaoReconhecido,
  type Sugestao,
  type TermoVoz,
} from '../../lib/vozCuradoria'
import { ETAPAS_FICHA, SECAO_DA_ETAPA, etapaVizinha, type EtapaFicha, type SecaoFicha } from '../../lib/secoesCuradoria'
import { EscutaContinua } from '../../lib/escutaContinua'

// CURADORIA POR VOZ (topo da coluna da ficha; flutua no canto so no modo
// "ampliar imagem", quando a coluna fica escondida).
//
// Fluxo: microfone (clique ou Alt+V) -> audio vai ao backend
// (/voz/transcrever) -> Whisper LOCAL (o audio nao sai da maquina e nao e
// guardado) -> texto -> regras de lib/vozCuradoria.ts -> ficha salva como
// RASCUNHO (aprovar continua manual). Auditoria: "preenchimento_por_voz".
//
// Comportamento inspirado nos sistemas de laudo por voz profissionais
// (PowerScribe, Fluency):
// - o que foi reconhecido COM CERTEZA vai direto ao campo, e a secao da
//   coluna pisca em destaque (onDestacar) - nao ha lista "a conferir";
// - o que foi reconhecido por SEMELHANCA (provavel erro de transcricao)
//   NAO entra sozinho: aparece em "Dúvidas" com "Você quis dizer…?", e o
//   curador confirma com um clique; marcando "Lembrar", a frase ouvida e
//   ensinada ao sistema (POST /voz/frases) e da proxima vez e reconhecida;
// - "macro <nome>" aplica uma frase pronta da equipe;
// - a secao em destaque e o destino da fala sem palavra-guia.

const API = process.env.NEXT_PUBLIC_API_URL
const DURACAO_MAXIMA_MS = 60_000

type Duvida = NaoReconhecido & { id: number; lembrar: boolean }
type Preenchido = Alteracao & { id: number }

function ensinavel(s: Sugestao): boolean {
  return s.destino?.tipo === 'alteracao' || s.destino?.tipo === 'termo'
}

export default function PainelVoz({
  fichaId,
  form,
  onAplicar,
  onSalvar,
  embutido = false,
  etapaAtiva,
  onEtapa,
  onDestacar,
  macros = [],
  frasesAprendidas = [],
  onAprendeu,
  onDuvidas,
  onNadaRegistrar,
  continuo = false,
  aoLado,
}: {
  fichaId: number
  form: FormularioFicha
  /** aplica o novo formulario e salva como rascunho (origem: voz) */
  onAplicar: (novo: FormularioFicha) => void
  onSalvar: () => void
  /** dentro da coluna da ficha (sem posicao fixa na tela) */
  embutido?: boolean
  /** item no holofote: destino da fala sem palavra-guia. O holofote NAO
   * muda sozinho depois de preencher - so com Tab/↓ ou "próximo campo". */
  etapaAtiva?: EtapaFicha
  /** "próximo campo" / "campo anterior" falados */
  onEtapa?: (etapa: EtapaFicha) => void
  /** faz piscar as secoes que acabaram de receber dados */
  onDestacar?: (campos: CampoVoz[]) => void
  macros?: MacroVoz[]
  frasesAprendidas?: { frase: string; alteracao: string }[]
  /** chamado depois de ensinar uma frase (recarregar vocabulario/frases) */
  onAprendeu?: () => void
  /** informa quantas duvidas estao pendentes (conferencia antes de aprovar) */
  onDuvidas?: (quantidade: number) => void
  /** fala "nada a registrar": marca a secao em destaque como revisada */
  onNadaRegistrar?: (secao?: SecaoFicha) => void
  /** ESCUTA CONTINUA: o microfone abre no inicio da curadoria e fica
   * aberto; cada fala (separada por uma pausa curta) preenche o item do
   * holofote, que passa sozinho ao proximo (ver lib/escutaContinua.ts e
   * itemResolvidoPelaFala em lib/vozCuradoria.ts) */
  continuo?: boolean
  /** botoes ao lado do microfone (Como laudar, Macros) - modo embutido */
  aoLado?: ReactNode
}) {
  const t = useTranslations('Voz')
  const tEtapas = useTranslations('Curadoria.etapas')
  const [aberto, setAberto] = useState(false)
  const [disponivel, setDisponivel] = useState<boolean | null>(null)
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  // o reconhecimento devolveu um trecho sem palavras (ruido, respiracao,
  // fala muito baixa ou cortada) - aviso discreto, some na proxima fala
  const [avisoVazio, setAvisoVazio] = useState(false)
  const [ultimoTexto, setUltimoTexto] = useState('')
  const [preenchidos, setPreenchidos] = useState<Preenchido[]>([])
  const [duvidas, setDuvidas] = useState<Duvida[]>([])
  const duvidasRef = useRef<Duvida[]>([])
  duvidasRef.current = duvidas
  const [podeDesfazer, setPodeDesfazer] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [vocabulario, setVocabulario] = useState<TermoVoz[]>([])

  // Ficha mais atual para a voz. IMPORTANTE: tambem e atualizada NA HORA em
  // aplicar()/desfazer() (nao so quando a tela redesenha). Na escuta
  // continua varias falas podem ser aplicadas em sequencia antes de a tela
  // redesenhar (ex.: a 1a transcricao demora e as seguintes chegam juntas);
  // sem isso, cada fala partia da ficha ANTIGA e apagava o que a fala
  // anterior tinha preenchido (anonimizacao, sexo, dentes "sumiam").
  const formRef = useRef(form)
  const formAplicadoRef = useRef<FormularioFicha | null>(null)
  if (formAplicadoRef.current && formAplicadoRef.current !== form) {
    // a tela ja recebeu o que a voz aplicou (ou o curador mudou algo a mao)
    formAplicadoRef.current = null
  }
  if (!formAplicadoRef.current) formRef.current = form
  // valores atuais para o processamento que termina depois da gravacao
  const opcoesRef = useRef({ etapaAtiva, macros, frasesAprendidas, vocabulario })
  opcoesRef.current = { etapaAtiva, macros, frasesAprendidas, vocabulario }
  const gravadorRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const limiteRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contadorRef = useRef(0)

  const carregarVocabulario = useCallback(() => {
    fetch(`${API}/vocabulario`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.termos && setVocabulario(d.termos))
      .catch(() => {})
  }, [])

  // servico de voz no ar? + vocabulario controlado
  useEffect(() => {
    fetch(`${API}/voz/saude`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { disponivel: false }))
      .then((d) => setDisponivel(Boolean(d.disponivel)))
      .catch(() => setDisponivel(false))
    carregarVocabulario()
  }, [carregarVocabulario])

  useEffect(() => {
    onDuvidas?.(duvidas.length)
  }, [duvidas.length, onDuvidas])

  // outra ficha: recomeca
  useEffect(() => {
    setPreenchidos([])
    setDuvidas([])
    historicoRef.current = []
    setPodeDesfazer(false)
    setUltimoTexto('')
    setErro('')
  }, [fichaId])

  // historico para "desfazer" (ate 20 passos) - em ref para nao repetir
  // efeitos colaterais quando o React reexecuta atualizacoes de estado
  const historicoRef = useRef<FormularioFicha[]>([])
  const aplicar = useCallback(
    (novo: FormularioFicha, campos: CampoVoz[]) => {
      historicoRef.current = [...historicoRef.current.slice(-19), formRef.current]
      setPodeDesfazer(true)
      formRef.current = novo
      formAplicadoRef.current = novo
      onAplicar(novo)
      if (campos.length) onDestacar?.(campos)
    },
    [onAplicar, onDestacar]
  )

  const desfazer = useCallback(() => {
    const h = historicoRef.current
    if (!h.length) return
    const anterior = h[h.length - 1]
    historicoRef.current = h.slice(0, -1)
    setPodeDesfazer(historicoRef.current.length > 0)
    formRef.current = anterior
    formAplicadoRef.current = anterior
    onAplicar(anterior)
    setAviso(t('desfeito'))
  }, [onAplicar, t])

  // item no holofote usado para interpretar a proxima fala. E atualizado NA
  // HORA quando o holofote anda (sem esperar a tela redesenhar): com o
  // curador falando rapido, a fala seguinte ja vai para o item certo.
  const etapaRef = useRef<EtapaFicha | undefined>(etapaAtiva)
  useEffect(() => {
    etapaRef.current = etapaAtiva
  }, [etapaAtiva])
  function irPara(etapa: EtapaFicha) {
    etapaRef.current = etapa
    onEtapa?.(etapa)
  }

  function processarTexto(texto: string) {
    setUltimoTexto(texto)
    setAviso('')
    setAvisoVazio(false)
    const o = opcoesRef.current
    const etapa = etapaRef.current
    // no passo "Aprovar" o microfone esta fechado: sobra de fala e ignorada
    if (etapa === 'aprovar') return
    // havia uma duvida com opcoes na tela (ex.: "cárie" -> esmalte? dentina?):
    // a fala pode ESCOLHER a opcao ("dentina", "dois") sem clicar
    const pendente = duvidasRef.current[duvidasRef.current.length - 1]
    if (pendente?.sugestoes.length) {
      const escolha = escolherSugestaoPorVoz(texto, pendente.sugestoes.map((s) => s.rotulo))
      if (escolha !== null) {
        aceitarSugestao(pendente, pendente.sugestoes[escolha])
        // escuta continua: achados todos ligados -> o holofote anda sozinho
        if (continuo && etapa === 'achados' && onEtapa) {
          const f = formRef.current
          const ligadas = new Set((f.achados ?? []).flatMap((a) => a.marcacoes))
          if (f.marcacoes.length && f.marcacoes.every((m) => ligadas.has(m.id))) irPara(etapaVizinha(etapa, 1))
        }
        return
      }
    }
    const r = interpretar(texto, formRef.current, o.vocabulario, {
      secaoAtiva: etapa ? SECAO_DA_ETAPA[etapa] : undefined,
      etapa,
      macros: o.macros,
      frasesAprendidas: o.frasesAprendidas,
    })
    if (r.alteracoes.length) {
      // retorno curto do que foi entendido (linha abaixo do microfone)
      setAviso(`“${texto.replace(/[.!?]+$/, '')}” → ${r.alteracoes.map((a) => a.descricao).join(' · ')}`)
      aplicar({ ...formRef.current, ...r.ficha }, r.alteracoes.map((a) => a.campo))
      setPreenchidos((p) => [...r.alteracoes.map((a) => ({ ...a, id: ++contadorRef.current })).reverse(), ...p].slice(0, 30))
    }
    if (r.naoReconhecidos.length) {
      const novas = r.naoReconhecidos.map((x) => ({ ...x, id: ++contadorRef.current, lembrar: !!x.parecido && x.sugestoes.some(ensinavel) }))
      // ref atualizada na hora: a fala seguinte ja pode responder a duvida
      duvidasRef.current = [...duvidasRef.current, ...novas]
      setDuvidas((d) => [...d, ...novas])
    }
    let navegou = false
    for (const c of r.comandos) {
      if (c === 'salvar') onSalvar()
      if (c === 'desfazer') desfazer()
      if (c === 'nada_a_registrar') onNadaRegistrar?.(etapa ? SECAO_DA_ETAPA[etapa] : undefined)
      if ((c === 'proxima_secao' || c === 'secao_anterior') && onEtapa && etapa) {
        irPara(etapaVizinha(etapa, c === 'proxima_secao' ? 1 : -1))
        navegou = true
      }
    }
    // escuta continua: item resolvido -> o holofote passa ao proximo sozinho
    if (continuo && !navegou && etapa && onEtapa && etapa !== ETAPAS_FICHA[ETAPAS_FICHA.length - 1] && itemResolvidoPelaFala(etapa, r)) {
      irPara(etapaVizinha(etapa, 1))
    }
    // mostra O QUE foi ouvido quando nada foi entendido (ajuda a perceber
    // ruido, fala cortada ou palavra trocada pelo reconhecimento)
    if (!r.alteracoes.length && !r.naoReconhecidos.length && !r.comandos.length) setErro(t('naoEntendi', { texto: texto.trim() }))
  }

  /** manda o audio ao Whisper local e devolve o texto (ou null) */
  async function transcrever(blob: Blob, rapido: boolean, etapaDica?: string): Promise<string | null> {
    try {
      const dados = new FormData()
      dados.append('arquivo', blob, blob.type.includes('mp4') ? 'trecho.mp4' : 'trecho.webm')
      if (rapido) dados.append('rapido', '1')
      // item esperado: o servidor manda ao Whisper so as palavras daquele
      // item como dica (reconhecimento bem mais certeiro em falas curtas)
      if (etapaDica) dados.append('etapa', etapaDica)
      const r = await fetch(`${API}/voz/transcrever`, { method: 'POST', credentials: 'include', body: dados })
      if (!r.ok) {
        let detalhe = t('erroTranscrever')
        try {
          const j = await r.json()
          if (typeof j?.detail === 'string') detalhe = j.detail
        } catch {
          // sem corpo legivel
        }
        setErro(r.status === 429 ? t('erroMuitos') : detalhe)
        return null
      }
      const j = await r.json()
      // '' = o reconhecimento nao achou palavras; null = erro
      return (j.texto ?? '').trim()
    } catch {
      setErro(t('erroTranscrever'))
      return null
    }
  }

  async function enviar(blob: Blob) {
    setTranscrevendo(true)
    setErro('')
    try {
      const texto = await transcrever(blob, false)
      if (texto) processarTexto(texto)
      else if (texto === '') setErro(t('nadaOuvido'))
    } finally {
      setTranscrevendo(false)
    }
  }

  // ---------------------------------------------------- escuta continua
  // Cada trecho e transcrito assim que chega (em paralelo, para ser rapido),
  // mas os textos sao APLICADOS na ordem em que foram falados (fila), para o
  // holofote andar na sequencia certa: "ok" -> "pan" -> "35" -> "f"...
  const [escutando, setEscutando] = useState(false)
  const [falando, setFalando] = useState(false)
  const [naFila, setNaFila] = useState(0)
  const escutaRef = useRef<EscutaContinua | null>(null)
  const filaRef = useRef<Promise<void>>(Promise.resolve())
  const fichaIdRef = useRef(fichaId)
  fichaIdRef.current = fichaId
  const processarRef = useRef(processarTexto)
  processarRef.current = processarTexto
  const transcreverRef = useRef(transcrever)
  transcreverRef.current = transcrever

  const pendentesRef = useRef(0)
  const aoTrecho = useCallback((audio: Blob) => {
    const ficha = fichaIdRef.current
    setNaFila((n) => n + 1)
    // dica para o Whisper: o item em destaque (se nenhuma fala anterior ainda
    // esta sendo processada, ele e certo); senao, palavras curtas de todos
    const dica = pendentesRef.current === 0 ? etapaRef.current : 'curto'
    pendentesRef.current += 1
    const texto = transcreverRef.current(audio, true, dica)
    filaRef.current = filaRef.current.then(async () => {
      try {
        const t = await texto
        // imagem trocada enquanto transcrevia: a fala era da imagem anterior
        if (t && ficha === fichaIdRef.current) processarRef.current(t)
        else if (t === '' && ficha === fichaIdRef.current) setAvisoVazio(true)
      } finally {
        pendentesRef.current -= 1
        setNaFila((n) => n - 1)
      }
    })
  }, [])

  // `iniciada`: o curador ja apertou Enter (o microfone foi aberto uma vez).
  // Dali em diante o microfone fica aberto em todos os itens e FECHA no
  // passo "Aprovar" (o curador confere e aprova com Enter); na imagem
  // seguinte (holofote de volta na anonimizacao) ele reabre sozinho.
  // `pausaManual`: o curador pausou pelo botao ou Alt+V.
  const [iniciada, setIniciada] = useState(false)
  const [pausaManual, setPausaManual] = useState(false)

  const ligarEscuta = useCallback(async () => {
    if (escutaRef.current?.ativa) return
    setErro('')
    // pede ao servico de voz que carregue o modelo JA (a 1a fala nao espera)
    fetch(`${API}/voz/aquecer`, { method: 'POST', credentials: 'include' }).catch(() => {})
    const escuta = new EscutaContinua({ onTrecho: aoTrecho, onFalando: setFalando })
    escutaRef.current = escuta
    const falha = await escuta.iniciar()
    if (falha) {
      setErro(t(falha))
      escutaRef.current = null
      return
    }
    setIniciada(true)
  }, [aoTrecho, t])

  // abre/fecha conforme o passo: fechado no "Aprovar" e na pausa manual
  useEffect(() => {
    const escuta = escutaRef.current
    if (!iniciada || !escuta?.ativa) return
    const aberto = !pausaManual && etapaAtiva !== 'aprovar'
    escuta.pausar(!aberto)
    setEscutando(aberto)
    if (!aberto) setFalando(false)
  }, [iniciada, pausaManual, etapaAtiva])

  function alternarEscuta() {
    if (!escutaRef.current) ligarEscuta()
    else setPausaManual((p) => !p)
  }

  // BARRA DE ESPACO = microfone: a primeira vez abre (inicia a curadoria
  // por voz); depois pausa/retoma. Nao vale no passo "Aprovar" (microfone
  // fechado), em campos de texto nem em janelas. O Enter fica para marcar
  // opcoes na curadoria manual (ver ColunaFichaCuradoria).
  const iniciadaRef = useRef(iniciada)
  iniciadaRef.current = iniciada
  useEffect(() => {
    if (!continuo || !disponivel) return
    function tecla(e: KeyboardEvent) {
      if (e.key !== ' ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (etapaRef.current === 'aprovar') return
      const alvo = document.activeElement
      if (
        alvo instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable || alvo.closest('[role="dialog"]'))
      )
        return
      e.preventDefault()
      // um botao focado nao deve ser "clicado" pelo espaco
      if (alvo instanceof HTMLElement && alvo.tagName === 'BUTTON') alvo.blur()
      if (!escutaRef.current) ligarEscuta()
      else setPausaManual((p) => !p)
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [continuo, disponivel, ligarEscuta])
  useEffect(
    () => () => {
      escutaRef.current?.parar()
      escutaRef.current = null
    },
    []
  )

  async function iniciar() {
    setErro('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErro(t('semSuporte'))
      return
    }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
      const gravador = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined)
      pedacosRef.current = []
      gravador.ondataavailable = (e) => e.data.size && pedacosRef.current.push(e.data)
      gravador.onstop = () => {
        fluxo.getTracks().forEach((faixa) => faixa.stop())
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || 'audio/webm' })
        if (blob.size > 0) enviar(blob)
      }
      gravador.start()
      gravadorRef.current = gravador
      setGravando(true)
      if (!embutido) setAberto(true)
      setSegundos(0)
      relogioRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
      limiteRef.current = setTimeout(() => parar(), DURACAO_MAXIMA_MS)
    } catch {
      setErro(t('semPermissao'))
    }
  }

  function parar() {
    if (relogioRef.current) clearInterval(relogioRef.current)
    if (limiteRef.current) clearTimeout(limiteRef.current)
    const g = gravadorRef.current
    if (g && g.state !== 'inactive') g.stop()
    gravadorRef.current = null
    setGravando(false)
  }

  const alternar = () => {
    if (continuo) return alternarEscuta()
    return gravando ? parar() : iniciar()
  }

  // atalho Alt+V (liga/desliga o microfone)
  const alternarRef = useRef(alternar)
  alternarRef.current = alternar
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        alternarRef.current()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('keydown', tecla)
      if (relogioRef.current) clearInterval(relogioRef.current)
      if (limiteRef.current) clearTimeout(limiteRef.current)
      const g = gravadorRef.current
      if (g && g.state !== 'inactive') g.stop()
    }
  }, [])

  function registrar(campo: CampoVoz, descricao: string) {
    setPreenchidos((p) => [{ id: ++contadorRef.current, campo, descricao }, ...p].slice(0, 30))
  }

  function enviarPara(item: Duvida, campo: 'descricao_didatica' | 'achados_detalhe' | 'observacoes_internas') {
    const atual = formRef.current[campo].trim()
    const valor = item.texto.charAt(0).toUpperCase() + item.texto.slice(1)
    aplicar({ ...formRef.current, [campo]: atual ? `${atual}${/[.!?;,]$/.test(atual) ? '' : ';'} ${valor}` : valor }, [campo])
    const nomes = { descricao_didatica: t('campoDescricao'), achados_detalhe: t('campoAchados'), observacoes_internas: t('campoObservacoes') }
    registrar(campo, `${nomes[campo]}: ${valor}`)
    duvidasRef.current = duvidasRef.current.filter((x) => x.id !== item.id)
    setDuvidas((n) => n.filter((x) => x.id !== item.id))
  }

  async function aceitarSugestao(item: Duvida, sug: Sugestao) {
    const campo: CampoVoz = sug.campo ?? 'alteracoes_observadas'
    aplicar({ ...formRef.current, ...sug.aplicar(formRef.current) }, [campo])
    registrar(campo, sug.rotulo)
    duvidasRef.current = duvidasRef.current.filter((x) => x.id !== item.id)
    setDuvidas((n) => n.filter((x) => x.id !== item.id))
    // "Lembrar": ensina a frase ouvida para as proximas vezes
    if (item.lembrar && ensinavel(sug) && sug.destino) {
      try {
        const r = await fetch(`${API}/voz/frases`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frase: item.texto, tipo: sug.destino.tipo, valor: sug.destino.valor }),
        })
        if (r.ok) {
          setAviso(t('aprendido', { frase: item.texto }))
          if (sug.destino.tipo === 'termo') carregarVocabulario()
          onAprendeu?.()
        }
      } catch {
        // ensinar e opcional: a ficha ja foi preenchida
      }
    }
  }

  const minutos = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`

  // ---------------------------------------------------------------- partes
  const botaoMicrofone = (grande: boolean) => (
    <button
      type="button"
      onClick={alternar}
      disabled={(!continuo && transcrevendo) || disponivel === false}
      aria-pressed={continuo ? escutando : gravando}
      title={continuo ? (escutando ? t('pausarEscuta') : t('retomarEscuta')) : gravando ? t('parar') : t('falar')}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-40 ${grande ? 'h-12 w-12' : 'h-9 w-9'} ${
        continuo
          ? escutando
            ? falando
              ? 'scale-110 border-emerald-300 bg-emerald-500 text-white shadow-[0_0_18px_rgba(52,211,153,.7)]'
              : 'border-emerald-400 bg-emerald-500/25 text-emerald-100'
            : 'border-slate-400 bg-slate-500/20 text-slate-300'
          : gravando
            ? 'animate-pulse border-red-400 bg-red-500/80 text-white'
            : 'border-teal-300 bg-teal-500/20 text-teal-100 hover:bg-teal-500/30'
      }`}
    >
      {!continuo && gravando ? <span className="h-3 w-3 rounded-sm bg-white" /> : <IconeMicrofone className={grande ? 'h-5 w-5' : 'h-4 w-4'} />}
    </button>
  )

  const barra = (
    <div className="flex items-center gap-2 px-2 py-1.5">
      {botaoMicrofone(false)}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-ink">
          {continuo
            ? `${escutando ? (falando ? t('ouvindoFala') : t('escutando')) : !escutaRef.current ? t('enterIniciar') : etapaAtiva === 'aprovar' ? t('pausadoAprovar') : t('pausado')}${naFila > 0 ? ` · ${t('transcrevendo')}` : ''}`
            : gravando
              ? `${t('gravando')} ${minutos}`
              : transcrevendo
                ? t('transcrevendo')
                : t('titulo')}
        </p>
        {etapaAtiva && (
          <p className="text-[11px] text-slate-400">
            {t('destino')} <span className="font-semibold text-teal-200">{tEtapas(etapaAtiva)}</span>

          </p>
        )}
        {erro ? (
          <p className="truncate text-[11px] text-red-400" title={erro}>{erro}</p>
        ) : aviso ? (
          <p className="truncate text-[11px] text-emerald-300" title={aviso}>{aviso}</p>
        ) : ultimoTexto ? (
          <p className="truncate text-[11px] italic text-slate-500" title={ultimoTexto}>“{ultimoTexto}”</p>
        ) : null}
      </div>
      {podeDesfazer && (
        <button type="button" onClick={desfazer} title={t('desfazer')} aria-label={t('desfazer')} className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-slate-300 hover:border-teal-300">
          ↶
        </button>
      )}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        title={aberto ? t('recolher') : t('abrirPainel')}
        className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-slate-300 hover:border-teal-300"
      >
        {aberto ? '▾' : '▸'}
      </button>
    </div>
  )

  const blocoDuvidas = duvidas.length > 0 && (
    <div className="border-t border-orange-300/30 bg-orange-400/5 px-2 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-orange-200">
        {t('duvidas', { quantidade: duvidas.length })}
      </p>
      <ul className="max-h-[30vh] space-y-2 overflow-y-auto pr-1">
        {duvidas.map((n) => (
          <li key={n.id} className="rounded-md border border-orange-300/30 bg-black/10 p-2">
            <p className="text-xs text-slate-300">
              {t('ouvido')}: <span className="italic text-ink">“{n.texto}”</span>
            </p>
            {n.sugestoes.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {n.sugestoes.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => aceitarSugestao(n, s)}
                    className={`rounded border px-1.5 py-0.5 text-[11px] ${
                      i === 0 ? 'border-teal-300 bg-teal-400/15 font-semibold text-teal-100' : 'border-teal-300/40 text-teal-100'
                    } hover:bg-teal-300/20`}
                  >
                    {i === 0 && n.parecido ? `${t('voceQuisDizer')} ${s.rotulo}?` : s.rotulo}
                  </button>
                ))}
              </div>
            )}
            {n.sugestoes.some(ensinavel) && (
              <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={n.lembrar}
                  onChange={(e) => setDuvidas((l) => l.map((x) => (x.id === n.id ? { ...x, lembrar: e.target.checked } : x)))}
                  className="h-3 w-3"
                />
                {t('lembrar')}
              </label>
            )}
            <div className="mt-1 flex flex-wrap gap-1">
              <button type="button" onClick={() => enviarPara(n, 'descricao_didatica')} className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-white/10">
                → {t('campoDescricao')}
              </button>
              <button type="button" onClick={() => enviarPara(n, 'observacoes_internas')} className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-white/10">
                → {t('campoObservacoes')}
              </button>
              <button type="button" onClick={() => setDuvidas((l) => l.filter((x) => x.id !== n.id))} className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-red-300">
                {t('descartar')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  const blocoAberto = aberto && (
    <div className="max-h-[35vh] space-y-3 overflow-y-auto border-t border-white/10 p-3">
      {disponivel === false && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-300">{t('indisponivel')}</p>}
      <p className="text-[10px] text-slate-500">{t('privacidade')} {t('rodape')}</p>
      <div>
        <button type="button" onClick={() => setAjuda((v) => !v)} className="text-[11px] font-semibold text-teal-200 hover:underline" aria-expanded={ajuda}>
          {ajuda ? '▾' : '▸'} {t('ajudaTitulo')}
        </button>
        {ajuda && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-slate-300">
            {(['ajuda1', 'ajuda2', 'ajuda3', 'ajuda4', 'ajuda5', 'ajuda6', 'ajuda7', 'ajuda8', 'ajuda9'] as const).map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        )}
      </div>
      {preenchidos.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('preenchido')}</p>
          <ul className="space-y-0.5">
            {preenchidos.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-xs text-slate-300">
                <span className="text-emerald-400" aria-hidden="true">✓</span>
                <span className="min-w-0 break-words">{c.descricao}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )

  if (embutido) {
    // so o CIRCULO do microfone (cor = estado) com "Pressione espaço para
    // áudio" embaixo; ao lado, os botoes extras (Como laudar, Macros). Erro
    // e duvidas da voz aparecem so quando existem.
    return (
      <section aria-label={t('titulo')} onKeyDown={(e) => e.stopPropagation()} className="relative z-20 space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex w-28 shrink-0 flex-col items-center gap-1">
            {botaoMicrofone(true)}
            <p className="text-center text-[11px] leading-tight text-slate-400">{t('espacoAudio')}</p>
          </div>
          {aoLado && <div className="flex flex-wrap items-center gap-2 pt-2">{aoLado}</div>}
        </div>
        {(erro || disponivel === false) ? (
          <p className="text-[11px] text-red-300" role="alert">
            {erro || t('indisponivel')}
          </p>
        ) : (
          // retorno da ultima fala: o curador ve o que a voz preencheu
          aviso ? (
            <p className="truncate text-[11px] text-emerald-300" title={aviso} aria-live="polite">
              ✓ {aviso}
            </p>
          ) : (
            avisoVazio && <p className="text-[11px] text-slate-400">{t('nadaOuvido')}</p>
          )
        )}
        {duvidas.length > 0 && <div className="overflow-hidden rounded-xl border border-orange-300/50">{blocoDuvidas}</div>}
      </section>
    )
  }

  // ---------------------------------------------- flutuante (ampliar imagem)
  if (!aberto && !duvidas.length) {
    return (
      <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAberto(true)}
          title={t('abrirPainel')}
          className="flex items-center gap-2 rounded-full border border-teal-300/60 bg-base-surface/95 px-4 py-2.5 text-sm font-semibold text-teal-100 shadow-2xl backdrop-blur hover:border-teal-300"
        >
          <IconeMicrofone className="h-4 w-4" />
          {t('titulo')}
        </button>
      </div>
    )
  }
  return (
    <section
      className="fixed bottom-4 right-4 z-[60] w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-teal-300/40 bg-base-surface/95 text-left shadow-2xl backdrop-blur-md"
      aria-label={t('titulo')}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {barra}
      {blocoDuvidas}
      {blocoAberto}
    </section>
  )
}

function IconeMicrofone({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  )
}
