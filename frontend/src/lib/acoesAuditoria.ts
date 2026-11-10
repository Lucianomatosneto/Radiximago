/**
 * CATALOGO DAS ACOES DA AUDITORIA (01/11/2026 - auditoria do
 * administrador, M3). Todas as acoes de docs/REGISTROS.md, agrupadas por
 * tema, com rotulo em portugues e ingles - a tela nunca mostra o codigo cru.
 * O teste backend/tests/test_auditoria_legivel.py confere que toda acao
 * documentada tem rotulo aqui. Acao desconhecida (registro antigo) vira um
 * texto legivel ("moldura_recortada" -> "Moldura recortada") no grupo "Outras".
 */

export interface AcaoAuditoria {
  valor: string
  pt: string
  en: string
}

export interface GrupoAcoes {
  chave: string
  pt: string
  en: string
  itens: AcaoAuditoria[]
}

const a = (valor: string, pt: string, en: string): AcaoAuditoria => ({ valor, pt, en })

export const GRUPOS_ACOES: GrupoAcoes[] = [
  {
    chave: 'acesso',
    pt: 'Acesso e sessões',
    en: 'Access and sessions',
    itens: [
      a('login', 'Entrada no sistema', 'Sign-in'),
      a('falha_login', 'Entrada recusada (senha errada)', 'Sign-in failed'),
      a('logout', 'Saída do sistema', 'Sign-out'),
      a('troca_senha', 'Senha trocada', 'Password changed'),
      a('falha_troca_senha', 'Troca de senha recusada', 'Password change failed'),
      a('solicitacao_redefinicao_senha', 'Pedido de redefinição de senha', 'Password reset requested'),
      a('redefinicao_senha', 'Senha redefinida', 'Password reset'),
      a('falha_segundo_fator', 'Código das 2 etapas errado', 'Two-step code failed'),
      a('segundo_fator_ativado', 'Login em 2 etapas ativado', 'Two-step sign-in enabled'),
      a('segundo_fator_desativado', 'Login em 2 etapas desativado', 'Two-step sign-in disabled'),
      a('codigo_recuperacao_usado', 'Código de recuperação usado', 'Recovery code used'),
      a('novos_codigos_recuperacao', 'Novos códigos de recuperação', 'New recovery codes'),
      a('segundo_fator_redefinido_pelo_admin', '2 etapas redefinidas pelo administrador', 'Two-step reset by administrator'),
      a('segundo_fator_redefinido_pelo_servidor', '2 etapas redefinidas no servidor', 'Two-step reset on the server'),
      a('encerramento_sessao_pelo_usuario', 'Acesso encerrado pela própria pessoa', 'Session ended by the user'),
      a('encerramento_outras_sessoes', 'Outros acessos encerrados (Meus acessos)', 'Other sessions ended'),
      a('encerramento_sessoes_pelo_admin', 'Acessos encerrados pelo administrador', 'Sessions ended by administrator'),
      a('encerramento_sessoes_de_todos', 'Acessos de todos encerrados', 'Everyone’s sessions ended'),
    ],
  },
  {
    chave: 'cadastro',
    pt: 'Cadastro e pedidos de acesso',
    en: 'Sign-up and access requests',
    itens: [
      a('solicitacao_acesso_registrada', 'Pedido de acesso registrado', 'Access request registered'),
      a('confirmacao_email_solicitacao', 'E-mail do pedido confirmado', 'Request e-mail confirmed'),
      a('falha_confirmacao_email', 'Confirmação de e-mail recusada', 'E-mail confirmation failed'),
      a('aprovacao_solicitacao_acesso', 'Pedido aprovado pelo administrador', 'Request approved by administrator'),
      a('aprovacao_automatica_solicitacao', 'Pedido aprovado automaticamente (estudante)', 'Request approved automatically'),
      a('rejeicao_solicitacao_acesso', 'Pedido rejeitado', 'Request rejected'),
      a('solicitacao_duplicada_descartada', 'Pedido duplicado descartado', 'Duplicate request discarded'),
    ],
  },
  {
    chave: 'usuarios',
    pt: 'Usuários',
    en: 'Users',
    itens: [
      a('criacao_usuario', 'Usuário criado', 'User created'),
      a('edicao_usuario', 'Usuário editado', 'User edited'),
      a('bloqueio_usuario', 'Usuário bloqueado', 'User blocked'),
      a('desbloqueio_usuario', 'Usuário reativado', 'User reactivated'),
      a('exclusao_usuario', 'Usuário excluído', 'User deleted'),
      a('atualizacao_foto_perfil', 'Foto de perfil trocada', 'Profile photo changed'),
      a('remocao_foto_perfil', 'Foto de perfil removida', 'Profile photo removed'),
    ],
  },
  {
    chave: 'seguranca',
    pt: 'Segurança e erros',
    en: 'Security and errors',
    itens: [
      a('acesso_negado', 'Acesso negado (sem permissão)', 'Access denied'),
      a('origem_recusada', 'Pedido de outro site recusado', 'Foreign origin refused'),
      a('limite_excedido', 'Limite de pedidos excedido', 'Rate limit exceeded'),
      a('entrada_recusada', 'Dado inválido recusado', 'Invalid input refused'),
      a('erro_inesperado', 'Erro inesperado do servidor', 'Unexpected server error'),
      a('verificacao_integridade_auditoria', 'Verificação da integridade da auditoria', 'Audit integrity check'),
      a('acesso_imagem_negado', 'Acesso a imagem negado', 'Image access denied'),
    ],
  },
  {
    chave: 'imagens',
    pt: 'Imagens',
    en: 'Images',
    itens: [
      a('upload_imagem', 'Imagem DICOM enviada', 'DICOM image uploaded'),
      a('foto_convertida_dicom', 'Foto convertida em DICOM', 'Photo converted to DICOM'),
      a('foto_janela_aberta', 'Envio de foto aberto (janela de 5 min)', 'Photo upload window opened'),
      a('foto_recebida', 'Foto recebida pelo celular', 'Photo received from phone'),
      a('foto_enviada_analise', 'Foto enviada para análise', 'Photo sent for review'),
      a('foto_recusada', 'Foto recusada', 'Photo rejected'),
      a('termos_uso_aceitos', 'Termos de Uso e Privacidade aceitos', 'Terms of Use and Privacy accepted'),
      a('termos_uso_recusados', 'Termos de Uso recusados (não entrou)', 'Terms of Use refused (no access)'),
      a('termo_ciencia_aceito', 'Termo de ciência aceito', 'Acknowledgement accepted'),
      a('termo_ciencia_recusado', 'Termo de ciência recusado (não entrou)', 'Acknowledgement refused (no access)'),
      a('imagem_enviada_analise', 'Imagem enviada para análise', 'Image sent for review'),
      a('imagem_analise_para_fila', 'Imagem analisada colocada na fila de curadoria', 'Reviewed image sent to curation queue'),
      a('imagem_analise_devolvida', 'Imagem analisada devolvida com recado', 'Reviewed image returned with a note'),
      a('imagem_pessoal_retirada', 'Imagem pessoal retirada pelo dono', 'Personal image removed by owner'),
      a('imagem_enviada_pessoas', 'Imagem enviada a pessoas ou grupos', 'Image sent to people or groups'),
      a('grupo_envio_criado', 'Grupo de envio criado', 'Sending group created'),
      a('grupo_envio_editado', 'Grupo de envio alterado', 'Sending group changed'),
      a('grupo_envio_apagado', 'Grupo de envio apagado', 'Sending group deleted'),
      a('sugestao_professor_enviada', 'Professor enviou a ficha ao curador', 'Professor sent the record to the curator'),
      a('sugestao_professor_guardada', 'Professor guardou a imagem marcada em Minhas imagens', 'Professor kept the marked image in My images'),
      a('aparelho_cadastrado', 'Aparelho da rede cadastrado', 'Network device registered'),
      a('aparelho_alterado', 'Aparelho da rede alterado', 'Network device changed'),
      a('aparelho_liberado', 'Aparelho da rede liberado', 'Network device allowed'),
      a('aparelho_bloqueado', 'Aparelho da rede bloqueado', 'Network device blocked'),
      a('aparelho_testado', 'Teste de conexão com aparelho', 'Network device connection test'),
      a('prancha_enviada_link', 'Prancha enviada a outra pessoa (link)', 'Plate sent to another person (link)'),
      a('prancha_recebida_aberta', 'Prancha recebida aberta', 'Received plate opened'),
      a('anexo_curadoria_adicionado', 'Anexo acrescentado à curadoria', 'Attachment added to curation'),
      a('anexo_curadoria_removido', 'Anexo removido da curadoria', 'Attachment removed from curation'),
      a('upload_sem_preambulo_dicom', 'DICOM sem cabeçalho padrão aceito', 'DICOM without preamble accepted'),
      a('importacao_orthanc', 'Importação do Orthanc', 'Orthanc import'),
      a('anonimizacao_automatica', 'Anonimização automática', 'Automatic anonymization'),
      a('imagem_girada', 'Imagem girada', 'Image rotated'),
      a('moldura_recortada', 'Moldura branca recortada', 'White frame cropped'),
      a('curadorias_zeradas', 'Curadorias zeradas (roteiro)', 'Curations reset (script)'),
      a('prancha_gerada', 'Prancha gerada', 'Study sheet generated'),
    ],
  },
  {
    chave: 'curadoria',
    pt: 'Curadoria',
    en: 'Curation',
    itens: [
      a('criacao', 'Ficha de curadoria criada', 'Curation record created'),
      a('edicao_curadoria', 'Ficha de curadoria editada', 'Curation record edited'),
      a('preenchimento_por_voz', 'Ficha preenchida por voz', 'Record filled by voice'),
      a('aprovacao', 'Ficha aprovada', 'Record approved'),
      a('descarte', 'Ficha descartada', 'Record discarded'),
      a('curadoria_reaberta', 'Ficha reaberta para editar', 'Record reopened for editing'),
      a('solicitacao_segunda_opiniao', 'Segunda opinião pedida', 'Second opinion requested'),
      a('resposta_segunda_opiniao', 'Segunda opinião respondida', 'Second opinion answered'),
      a('aprovacao_pos_segunda_opiniao', 'Aprovada após segunda opinião', 'Approved after second opinion'),
      a('descarte_pos_segunda_opiniao', 'Descartada após segunda opinião', 'Discarded after second opinion'),
      a('anotacao_segunda_opiniao_incorporada', 'Anotação da segunda opinião incorporada', 'Second-opinion note incorporated'),
      a('anotacao_segunda_opiniao_dispensada', 'Anotação da segunda opinião dispensada', 'Second-opinion note dismissed'),
      a('criacao_achado', 'Achado criado', 'Finding created'),
      a('edicao_achado', 'Achado editado', 'Finding edited'),
      a('exclusao_achado', 'Achado excluído', 'Finding deleted'),
      a('criacao_erro_tecnico', 'Erro técnico registrado', 'Technical error recorded'),
      a('edicao_erro_tecnico', 'Erro técnico editado', 'Technical error edited'),
      a('exclusao_erro_tecnico', 'Erro técnico excluído', 'Technical error deleted'),
      a('segmentacao_criada', 'Estrutura pintada (segmentação)', 'Segmentation created'),
      a('segmentacao_alterada', 'Segmentação alterada', 'Segmentation changed'),
      a('segmentacao_apagada', 'Segmentação apagada', 'Segmentation deleted'),
      a('transcricao_voz', 'Fala transcrita (voz)', 'Speech transcribed'),
      a('voz_frase_aprendida', 'Frase de voz aprendida', 'Voice phrase learned'),
      a('voz_frase_esquecida', 'Frase de voz esquecida', 'Voice phrase forgotten'),
    ],
  },
  {
    chave: 'vocabulario',
    pt: 'Vocabulário e macros',
    en: 'Vocabulary and macros',
    itens: [
      a('vocabulario_termo_criado', 'Termo do vocabulário criado', 'Vocabulary term created'),
      a('vocabulario_termo_editado', 'Termo do vocabulário editado', 'Vocabulary term edited'),
      a('vocabulario_sinonimo_criado', 'Sinônimo criado', 'Synonym created'),
      a('vocabulario_sinonimo_removido', 'Sinônimo removido', 'Synonym removed'),
      a('vocabulario_fichas_vinculadas', 'Termos ligados à ficha', 'Terms linked to record'),
      a('vocabulario_ficha_desvinculada', 'Termo desligado da ficha', 'Term unlinked from record'),
      a('macro_criada', 'Macro criada', 'Macro created'),
      a('macro_editada', 'Macro editada', 'Macro edited'),
      a('macro_desativada', 'Macro desativada', 'Macro deactivated'),
    ],
  },
  {
    chave: 'manutencao',
    pt: 'Manutenção',
    en: 'Maintenance',
    itens: [
      a('limpeza_dados_demo', 'Dados de demonstração removidos', 'Demo data removed'),
    ],
  },
  {
    chave: 'email',
    pt: 'Compartilhamento e e-mail',
    en: 'Sharing and e-mail',
    itens: [
      a('compartilhamento_imagem', 'Imagem compartilhada', 'Image shared'),
      a('resposta_compartilhamento', 'Resposta a compartilhamento', 'Share answered'),
      a('compartilhamento_desfeito', 'Compartilhamento desfeito', 'Share removed'),
      a('prancha_enviada_email', 'Prancha enviada por e-mail', 'Study sheet e-mailed'),
      a('falha_envio_email', 'E-mail não enviado (falha)', 'E-mail not sent (failure)'),
    ],
  },
  {
    chave: 'sugestoes',
    pt: 'Sugestões de melhoria',
    en: 'Improvement suggestions',
    itens: [
      a('sugestao_enviada', 'Sugestão enviada', 'Suggestion sent'),
      a('sugestao_assumida', 'Curador assumiu a sugestão do professor', 'Curator took over the professor suggestion'),
      a('envio_ao_curador', 'Professor enviou a ficha ao curador (histórico)', 'Professor sent the record to the curator (history)'),
      a('sugestao_andamento_alterado', 'Andamento da sugestão alterado', 'Suggestion status changed'),
    ],
  },
]

const POR_VALOR = new Map(GRUPOS_ACOES.flatMap((g) => g.itens.map((i) => [i.valor, i] as const)))

/** "moldura_recortada" -> "Moldura recortada" (nunca o codigo cru) */
export function textoLegivel(valor: string): string {
  const t = valor.replace(/_/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : '—'
}

export function rotuloAcao(valor: string, idioma: string, detalhes?: string | null): string {
  // reativacoes antigas (antes de 01/11/2026) eram gravadas como bloqueio
  if (valor === 'bloqueio_usuario' && (detalhes ?? '').includes('desbloqueado')) valor = 'desbloqueio_usuario'
  const item = POR_VALOR.get(valor)
  if (!item) return textoLegivel(valor)
  return idioma === 'en' ? item.en : item.pt
}

export const conhecida = (valor: string) => POR_VALOR.has(valor)

/** coluna "Sobre o quê": nome padronizado da entidade */
const ENTIDADES: Record<string, [string, string]> = {
  user: ['Usuário', 'User'],
  curation: ['Ficha', 'Record'],
  orthanc_reference: ['Imagem', 'Image'],
  access_request: ['Pedido de acesso', 'Access request'],
  grupo_envio: ['Grupo de envio', 'Sending group'],
  pedido: ['Pedido ao servidor', 'Server request'],
  audit_log: ['Auditoria', 'Audit log'],
  achado: ['Achado', 'Finding'],
  erro_tecnico: ['Erro técnico', 'Technical error'],
  termo_vocabulario: ['Termo do vocabulário', 'Vocabulary term'],
  macro: ['Macro', 'Macro'],
  sugestao: ['Sugestão', 'Suggestion'],
  compartilhamento: ['Compartilhamento', 'Share'],
  sessao: ['Sessão', 'Session'],
  segmentacao: ['Segmentação', 'Segmentation'],
  voz: ['Voz', 'Voice'],
  imagem: ['Imagem', 'Image'],
}

export function rotuloEntidade(entidade: string | null, id: number | null, idioma: string): string {
  if (!entidade) return '—'
  const par = ENTIDADES[entidade]
  const nome = par ? (idioma === 'en' ? par[1] : par[0]) : textoLegivel(entidade)
  return id !== null && id !== undefined ? `${nome} nº ${id}` : nome
}

/** Detalhes para MOSTRAR: tira a parte de busca (?...) de enderecos tecnicos
 * gravados antes de 01/11/2026 (podiam levar o identificador DICOM do
 * paciente, 00100020). O registro guardado nao muda. */
// registros ANTIGOS gravados sem acento (a auditoria e selada: nao se
// reescreve o banco, so a forma de mostrar) - reteste de 01/11/2026
const SEM_ACENTO: [RegExp, string][] = [[/\bnao cadastrado\b/g, 'não cadastrado']]

export function detalhesLegiveis(texto: string | null | undefined): string {
  if (!texto) return ''
  let legivel = texto.replace(/(\/[^\s?]*)\?[^\s]*/g, '$1 (parâmetros de busca ocultos)')
  for (const [errado, certo] of SEM_ACENTO) legivel = legivel.replace(errado, certo)
  return legivel
}

/** M6 (01/11/2026): endereco de rede legivel. Os internos do Docker
 * (172.16-31.x, 10.x, 192.168.x, 127.x) significam "este computador / a
 * rede interna": no computador de desenvolvimento o Docker nao repassa o
 * endereco real. No servidor e no tunel o endereco real e gravado. */
export function ipLegivel(ip: string | null | undefined, idioma: string): string {
  if (!ip) return '—'
  const interno = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  if (!interno) return ip
  return `${ip} (${idioma === 'en' ? 'internal Docker network – local access' : 'rede interna do Docker – acesso local'})`
}
