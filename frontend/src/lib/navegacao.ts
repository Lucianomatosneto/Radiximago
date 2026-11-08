// Navegacao (01/11/2026): pagina inicial de cada perfil, trilha de
// navegacao (breadcrumb) e as telas que usam largura maxima de leitura.
// So leitura de rota - nao muda rotas nem permissoes.

export const paginaInicial = (perfil: string | null | undefined) =>
  perfil === 'administrador' ? '/dashboard' : '/banco-imagens'

/** Telas de texto, lista e formulario: conteudo com no maximo ~1200px,
 * centralizado. As telas de imagem (Pesquisa, Banco de imagens, Minhas
 * imagens, Compartilhadas, Curadoria, visualizador)
 * continuam com a largura toda. */
export const ROTAS_LARGURA_LIMITADA = [
  '/sugestoes', '/enviar-imagem', '/grupos', '/aparelhos', '/macros', '/vocabulario', '/usuarios', '/painel-admin', '/configuracoes',
  '/integracoes', '/meus-acessos', '/relatorios', '/dashboard',
]

/** Rotas sem trilha (telas de tela cheia). */
export const ROTAS_SEM_TRILHA = ['/curadoria']

export const casaRota = (rota: string, lista: string[]) =>
  lista.some((r) => rota === r || rota.startsWith(`${r}/`))

/** Segmento da rota -> chave de texto (namespace Navegacao.segmentos). */
export const SEGMENTOS: Record<string, string> = {
  dashboard: 'painel', 'painel-admin': 'painelAdministrativo', usuarios: 'usuarios', imagens: 'imagensRecebidas',
  curadoria: 'curadoria', 'segunda-opiniao': 'segundaOpiniao', 'banco-imagens': 'bancoImagens', pesquisa: 'pesquisa',
  'minhas-imagens': 'minhasImagens', 'compartilhadas-comigo': 'compartilhadasComigo', vocabulario: 'vocabulario',
  macros: 'macros', relatorios: 'relatorios', auditoria: 'auditoria', integracoes: 'integracoes',
  configuracoes: 'configuracoes', sugestoes: 'sugestoes', 'meus-acessos': 'meusAcessos', visualizar: 'imagem', 'enviar-imagem': 'enviarImagem', grupos: 'grupos', aparelhos: 'aparelhos',
}
