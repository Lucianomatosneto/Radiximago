// ERROS TECNICOS APARENTES (radiografias e tomografias odontologicas).
//
// A curadoria mostra SO os erros que fazem sentido para o tipo de exame
// escolhido em "Dados da imagem":
// - intraorais (periapical, interproximal, oclusal): erros gerais 1-14;
// - panoramica: gerais (sem corte de cone) + especificos da panoramica;
// - tomografia (TCFC/CBCT): especificos da tomografia.
// Valores iguais ao enum TipoErroTecnico do backend (app/modules/achados.py).
// `formas`: como o curador pode falar (sem acento, minusculas).

export type GrupoErro = 'geral' | 'panoramica' | 'tomografia'

export interface ErroTecnicoInfo {
  valor: string
  rotulo: string
  grupo: GrupoErro
  formas: string[]
}

export const ERROS_TECNICOS: ErroTecnicoInfo[] = [
  { valor: 'magnificacao', rotulo: 'Magnificação', grupo: 'geral', formas: ['magnificacao', 'ampliacao'] },
  { valor: 'distorcao', rotulo: 'Distorção', grupo: 'geral', formas: ['distorcao'] },
  { valor: 'alongamento', rotulo: 'Alongamento', grupo: 'geral', formas: ['alongamento', 'imagem alongada'] },
  { valor: 'encurtamento', rotulo: 'Encurtamento', grupo: 'geral', formas: ['encurtamento', 'imagem encurtada'] },
  { valor: 'sobreposicao_estruturas', rotulo: 'Sobreposição de estruturas', grupo: 'geral', formas: ['sobreposicao de estruturas', 'sobreposicao'] },
  { valor: 'corte_estruturas', rotulo: 'Corte de estruturas anatômicas', grupo: 'geral', formas: ['corte de estruturas anatomicas', 'corte de estruturas', 'corte de apice', 'corte de coroa'] },
  { valor: 'corte_cone', rotulo: 'Corte de cone (cone cut)', grupo: 'geral', formas: ['corte de cone', 'cone cut', 'meia lua'] },
  { valor: 'subexposicao', rotulo: 'Subexposição', grupo: 'geral', formas: ['subexposicao', 'subexposta', 'imagem clara'] },
  { valor: 'superexposicao', rotulo: 'Superexposição', grupo: 'geral', formas: ['superexposicao', 'superexposta', 'imagem escura', 'queimada'] },
  { valor: 'ruido_excessivo', rotulo: 'Granulação/ruído excessivo', grupo: 'geral', formas: ['granulacao', 'ruido excessivo', 'ruido'] },
  { valor: 'movimento', rotulo: 'Movimento do paciente', grupo: 'geral', formas: ['movimento do paciente', 'movimento'] },
  { valor: 'falta_nitidez', rotulo: 'Falta de nitidez', grupo: 'geral', formas: ['falta de nitidez', 'sem nitidez', 'borrada'] },
  { valor: 'artefato_metalico', rotulo: 'Artefatos metálicos', grupo: 'geral', formas: ['artefatos metalicos', 'artefato metalico'] },
  { valor: 'artefato_receptor', rotulo: 'Artefatos do receptor/sensor', grupo: 'geral', formas: ['artefato do receptor', 'artefato do sensor', 'artefatos do receptor', 'sensor danificado'] },
  { valor: 'imagem_fantasma', rotulo: 'Imagem fantasma', grupo: 'panoramica', formas: ['imagem fantasma', 'fantasma'] },
  { valor: 'lingua_afastada_palato', rotulo: 'Língua afastada do palato', grupo: 'panoramica', formas: ['lingua afastada do palato', 'lingua afastada', 'lingua fora do palato'] },
  { valor: 'labios_abertos', rotulo: 'Lábios abertos', grupo: 'panoramica', formas: ['labios abertos', 'labio aberto'] },
  { valor: 'posicionamento_ap_incorreto', rotulo: 'Posicionamento anterior ou posterior incorreto', grupo: 'panoramica', formas: ['posicionamento anterior', 'posicionamento posterior', 'paciente anteriorizado', 'paciente posteriorizado'] },
  { valor: 'rotacao_cabeca', rotulo: 'Rotação da cabeça', grupo: 'panoramica', formas: ['rotacao da cabeca', 'cabeca rodada', 'rotacao'] },
  { valor: 'inclinacao_cabeca', rotulo: 'Inclinação da cabeça', grupo: 'panoramica', formas: ['inclinacao da cabeca', 'cabeca inclinada', 'inclinacao'] },
  { valor: 'queixo_inadequado', rotulo: 'Queixo excessivamente baixo ou alto', grupo: 'panoramica', formas: ['queixo baixo', 'queixo alto', 'queixo'] },
  { valor: 'sobreposicao_coluna', rotulo: 'Sobreposição da coluna cervical', grupo: 'panoramica', formas: ['sobreposicao da coluna cervical', 'sobreposicao da coluna', 'coluna cervical'] },
  { valor: 'tc_artefato_movimento', rotulo: 'Artefato de movimento', grupo: 'tomografia', formas: ['artefato de movimento', 'movimento'] },
  { valor: 'tc_artefato_metalico', rotulo: 'Artefato metálico/estrias', grupo: 'tomografia', formas: ['artefato metalico', 'estrias', 'artefatos metalicos'] },
  { valor: 'tc_beam_hardening', rotulo: 'Beam hardening (endurecimento do feixe)', grupo: 'tomografia', formas: ['beam hardening', 'endurecimento do feixe'] },
  { valor: 'tc_truncamento', rotulo: 'Truncamento', grupo: 'tomografia', formas: ['truncamento'] },
  { valor: 'tc_ruido', rotulo: 'Ruído excessivo', grupo: 'tomografia', formas: ['ruido excessivo', 'ruido'] },
  { valor: 'tc_volume_parcial', rotulo: 'Efeito de volume parcial', grupo: 'tomografia', formas: ['efeito de volume parcial', 'volume parcial'] },
  { valor: 'tc_artefato_anel', rotulo: 'Artefato em anel (ring artifact)', grupo: 'tomografia', formas: ['artefato em anel', 'ring artifact', 'anel'] },
  { valor: 'tc_perda_resolucao', rotulo: 'Perda de resolução/nitidez', grupo: 'tomografia', formas: ['perda de resolucao', 'perda de nitidez', 'falta de nitidez'] },
]

/** erros possiveis para o tipo de exame (sem tipo: todos) */
export function errosParaTipo(tipo: string): ErroTecnicoInfo[] {
  if (tipo === 'tomografia') return ERROS_TECNICOS.filter((e) => e.grupo === 'tomografia')
  if (tipo === 'panoramica') return ERROS_TECNICOS.filter((e) => (e.grupo === 'geral' && e.valor !== 'corte_cone') || e.grupo === 'panoramica')
  if (tipo === 'periapical' || tipo === 'interproximal' || tipo === 'oclusal') return ERROS_TECNICOS.filter((e) => e.grupo === 'geral')
  return ERROS_TECNICOS
}

export function rotuloErro(valor: string): string {
  return ERROS_TECNICOS.find((e) => e.valor === valor)?.rotulo ?? valor
}
