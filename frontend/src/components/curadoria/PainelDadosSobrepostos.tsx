'use client'

import { useTranslations } from 'next-intl'
import StatusBadge from '../StatusBadge'
import SeletorDentesQuadrante from './SeletorDentesQuadrante'
import type { FormularioFicha } from './FichaCuradoriaForm'

// Constantes identicas as que existiam em FichaCuradoriaForm.tsx antes de
// serem movidas pra ca - ver comentario em PainelVisualizador.tsx sobre o
// motivo da mudanca (ocupar visualmente o espaco onde o OHIF mostra o
// painel "Studies", que o Radix nao consegue remover de dentro por ser
// iframe cross-origin). Os rotulos vem do namespace compartilhado
// Pesquisa.opcoes (mesmo texto usado na tela de Pesquisa avançada), so pra
// nao duplicar a mesma traducao em dois lugares - so o `valor` (chave real
// do backend) fica fixo aqui.
const OPCOES_TIPO_RADIOGRAFIA = ['periapical', 'panoramica', 'oclusal', 'interproximal']

const OPCOES_GENERO = ['masculino', 'feminino']

// Qualidade tecnica: veio de FichaCuradoriaForm.tsx - pedido explicito pra
// aparecer logo abaixo de Dentes. Valores reais do enum QualidadeTecnica
// no backend.
const OPCOES_QUALIDADE_TECNICA = ['otima', 'boa', 'regular', 'insatisfatoria']

// Tamanho de texto/controles alinhado ao pedido: todos os campos aqui do
// mesmo tamanho da palavra "Curadoria" / "Ficha de curadoria" (text-sm,
// 14px) - antes eram bem menores (text-[11px]/text-xs) por causa do
// espaco apertado, mas o pedido foi explicito pra aumentar a legibilidade
// mesmo custando mais altura (a caixa ja tem rolagem propria - ver
// overflow-y-auto no container abaixo - entao cabe do mesmo jeito).
const campoLabel = 'mb-1 block text-sm font-medium text-slate-300'
// Mesma cor de FichaCuradoriaForm.tsx (ver comentario completo la),
// aplicada aqui pra TODAS as caixas de texto desta tela (pedido
// explicito). COR SOLIDA (nao mais degrade azul->verde) - um degrade
// azul->verde na largura da caixa ficava com aparencia bem diferente
// aqui (caixa ESTREITA, 280px) do que nas caixas LARGAS de baixo
// (Descricao didatica etc.) - o teal solido fica identico nos dois.
// Usado pelos campos de faixa etaria e qualidade tecnica abaixo; o campo
// de dentes (mais abaixo) usa a mesma cor num wrapper proprio, ja que o
// input dele em si e transparente por cima do wrapper.
const campoInput =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'
const botaoOpcao =
  'rounded-full border px-3 py-1.5 text-sm transition-colors'

// Caixa sobreposta no canto superior esquerdo do visualizador OHIF (por
// cima da area onde o OHIF normalmente mostra o painel "Studies"). Reune
// os campos da ficha que precisam ficar sempre visiveis e acessiveis,
// inclusive no modo "ajustar a tela" (onde a ficha completa, mais abaixo
// na tela, fica escondida): status da ficha, anonimizacao (obrigatoria pra
// aprovar), tipo de radiografia (obrigatorio), dados do paciente (faixa
// etaria + sexo), dentes (notacao FDI) e qualidade tecnica. Fundo quase
// solido (bg-base-surface/95 + backdrop-blur) pra garantir leitura por
// cima da imagem de raio-X.
export default function PainelDadosSobrepostos({
  form,
  onChange,
  statusFicha,
  marcacaoAtiva = false,
  onAlternarMarcacao,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  statusFicha: string
  /** Estado e acao do botao "Marcar imagem" (abre a imagem para marcacao). */
  marcacaoAtiva?: boolean
  onAlternarMarcacao?: () => void
}) {
  const t = useTranslations('Curadoria.dadosSobrepostos')
  const tOpcoes = useTranslations('Pesquisa.opcoes')

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto rounded-xl border border-base-border bg-base-surface/95 p-3 shadow-lg backdrop-blur-sm">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">{t('status')}</span>
          <StatusBadge status={statusFicha} />
        </div>
        {/* Anonimização validada: checkbox e texto maiores (h-5 w-5 e
            text-sm, antes h-3.5 w-3.5 e text-xs) - pedido explícito. */}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.anonimizacao_validada}
            onChange={(e) => onChange({ ...form, anonimizacao_validada: e.target.checked })}
            className="h-5 w-5 rounded border-base-border bg-base-surface2 text-brand"
          />
          {t('anonimizacaoValidada')} <span className="text-status-danger">*</span>
        </label>
      </div>

      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>
          {t('tipoRadiografia')} <span className="text-status-danger">*</span>
        </label>
        {/* Grade 2x2 (Periapical/Panoramica numa linha, Oclusal/
            Interproximal na outra) - pedido explicito pra economizar
            altura nesta caixa e reduzir a necessidade de rolagem. So
            volta a fazer sentido agora que a caixa que envolve este
            painel tem largura FIXA em 280px (ver w-[280px] em
            PainelVisualizador.tsx, nao mais o clamp() variavel de antes,
            que as vezes deixava pouco espaco pra 2 colunas e espremia
            nomes longos como "Interproximal"). */}
        <div className="grid grid-cols-2 gap-1.5">
          {OPCOES_TIPO_RADIOGRAFIA.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => onChange({ ...form, tipo_radiografia: valor })}
              className={`${botaoOpcao} ${
                form.tipo_radiografia === valor
                  ? 'border-brand bg-brand text-white'
                  : 'border-base-border text-slate-300 hover:border-brand/50'
              }`}
            >
              {tOpcoes(`tipoRadiografia.${valor}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>{t('faixaEtaria')}</label>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="number"
            value={form.idade_min}
            onChange={(e) => onChange({ ...form, idade_min: e.target.value })}
            placeholder={t('idadeMin')}
            className={campoInput}
          />
          <input
            type="number"
            value={form.idade_max}
            onChange={(e) => onChange({ ...form, idade_max: e.target.value })}
            placeholder={t('idadeMax')}
            className={campoInput}
          />
        </div>
      </div>

      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>
          {t('sexo')} <span className="text-status-danger">*</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {OPCOES_GENERO.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => onChange({ ...form, genero: valor })}
              className={`${botaoOpcao} ${
                form.genero === valor
                  ? 'border-brand bg-brand text-white'
                  : 'border-base-border text-slate-300 hover:border-brand/50'
              }`}
            >
              {tOpcoes(`genero.${valor}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Dentes da FICHA (notação FDI) - regras odontológicas: quadrante
          primeiro, números só aparecem depois de escolhido (Fase 3);
          selecionar outro quadrante NÃO apaga os dentes já marcados nos
          quadrantes anteriores (SeletorDentesQuadrante mantém a seleção
          completa em `form.dentes`, independente de qual quadrante está
          sendo exibido no momento). Continua gravando no MESMO campo
          Curation.dentes de sempre - nenhum campo novo foi criado. */}
      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>{t('dentes')}</label>
        <div className="rounded-lg border border-teal-500/40 bg-teal-100/70 p-2 dark:bg-teal-600/20">
          <SeletorDentesQuadrante
            dentesSelecionados={form.dentes}
            onChange={(dentes) => onChange({ ...form, dentes })}
          />
        </div>
      </div>

      {/* Qualidade tecnica: pedido explicito pra ficar logo abaixo de
          Dentes (antes ficava na ficha de baixo, dentro de "Região
          anatômica" - saiu de lá pra não duplicar o mesmo campo em dois
          lugares). */}
      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>{t('qualidadeTecnica')}</label>
        <select
          value={form.qualidade_tecnica}
          onChange={(e) => onChange({ ...form, qualidade_tecnica: e.target.value })}
          className={campoInput}
        >
          <option value="">{t('selecione')}</option>
          {OPCOES_QUALIDADE_TECNICA.map((valor) => (
            <option key={valor} value={valor}>
              {tOpcoes(`qualidadeTecnica.${valor}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Marcar imagem: ultimo item da caixa, na MESMA sequencia do Tab dos
          campos acima (mesmo estilo de botao das opcoes). Abre o painel
          com a imagem para marcacao (oval/retangulo/seta), que fica
          escondido ate aqui para o visualizador ocupar a tela toda. */}
      {onAlternarMarcacao && (
        <div className="border-t border-base-border pt-2.5">
          <label className={campoLabel}>{t('marcacao')}</label>
          <button
            type="button"
            onClick={onAlternarMarcacao}
            aria-pressed={marcacaoAtiva}
            className={`${botaoOpcao} flex w-full items-center justify-center gap-2 ${
              marcacaoAtiva
                ? 'border-brand bg-brand text-white'
                : 'border-base-border text-slate-300 hover:border-brand/50'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <ellipse cx="12" cy="12" rx="8" ry="6" strokeDasharray="3 2.5" />
              <path d="M17.5 17.5 21 21" />
            </svg>
            {marcacaoAtiva ? t('fecharMarcacao') : t('marcarImagem')}
          </button>
        </div>
      )}
    </div>
  )
}
