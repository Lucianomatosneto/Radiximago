// CENTRAL DE AJUDA - conteudo dos topicos (botao "Ajuda" no topo da tela).
//
// Cada topico explica UM recurso do Radix em passos curtos. A busca
// (lib/ajuda/busca.ts) procura no titulo, nas palavras-chave (sinonimos do
// jeito que o usuario fala: "apagar", "excluir", "tirar"...) e no texto.
//
// `perfis`: quem ve o topico (omitido = todos os usuarios). Assim o
// estudante nao recebe ajuda de telas que ele nem acessa (curadoria,
// usuarios, auditoria...).
// `rotas`: telas onde o topico e mais util - aparece primeiro em "Nesta tela"
// quando a ajuda e aberta ali.
// `link`: tela para onde o botao "Ir para a tela" leva.
//
// IMPORTANTE ao mudar uma tela do sistema: atualize o topico dela aqui
// (o texto precisa descrever o que a tela faz HOJE).

export type IdiomaAjuda = 'pt' | 'en'

export type CategoriaAjuda =
  | 'primeirosPassos'
  | 'pesquisa'
  | 'visualizador'
  | 'minhasImagens'
  | 'anotacoes'
  | 'compartilhar'
  | 'impressao'
  | 'curadoria'
  | 'administracao'
  | 'conta'

export interface TextoAjuda {
  titulo: string
  resumo: string
  passos: string[]
  dica?: string
  /** sinonimos e jeitos de perguntar (so para a busca, nao aparecem) */
  palavras: string
}

export interface TopicoAjuda {
  id: string
  categoria: CategoriaAjuda
  perfis?: string[]
  rotas?: string[]
  link?: string
  pt: TextoAjuda
  en: TextoAjuda
}

const ADM = ['administrador']
const CUR = ['administrador', 'curador']
const ENVIO = ['administrador', 'curador', 'professor']

export const TOPICOS_AJUDA: TopicoAjuda[] = [
  // ───────────── PRIMEIROS PASSOS ─────────────
  {
    id: 'navegar',
    categoria: 'primeirosPassos',
    rotas: ['/dashboard'],
    pt: {
      titulo: 'Como navegar pelo Rádix',
      resumo: 'O menu da esquerda leva a todas as telas que o seu perfil pode usar.',
      passos: [
        'Use o menu "Navegação", à esquerda, para trocar de tela.',
        'Cada perfil vê só as telas que pode usar (o estudante vê, por exemplo, Banco de imagens, Minhas imagens e Compartilhadas comigo).',
        'O número ao lado de "Compartilhadas comigo" mostra quantas imagens novas chegaram para você.',
        'Para sair com segurança, clique em "Sair", no fim do menu.',
      ],
      palavras: 'menu navegacao tela inicio comecar começar onde fica telas sidebar lateral',
    },
    en: {
      titulo: 'Getting around Rádix',
      resumo: 'The left menu leads to every screen your profile can use.',
      passos: [
        'Use the "Navigation" menu on the left to switch screens.',
        'Each profile only sees the screens it can use (students see, for example, Image bank, My images and Shared with me).',
        'The number next to "Shared with me" shows how many new images arrived for you.',
        'To leave safely, click "Sign out" at the bottom of the menu.',
      ],
      palavras: 'menu navigation screen home start where sidebar',
    },
  },
  {
    id: 'finalidade',
    categoria: 'primeirosPassos',
    pt: {
      titulo: 'Para que serve o Rádix Imago',
      resumo: 'Plataforma acadêmica de ensino e pesquisa com radiografias odontológicas anonimizadas.',
      passos: [
        'As imagens servem para estudo e pesquisa (UFSC). Não são usadas para diagnóstico nem para laudo de pacientes.',
        'Todas as imagens são anonimizadas: nenhum dado que identifique o paciente fica disponível (LGPD).',
        'Cada imagem passa por curadoria: um curador confere a anonimização e descreve o que a imagem mostra.',
        'Só as imagens aprovadas na curadoria aparecem no Banco de imagens e na Pesquisa avançada.',
      ],
      palavras: 'sobre o que e objetivo lgpd anonimizada anonimizacao privacidade diagnostico laudo ensino pesquisa',
    },
    en: {
      titulo: 'What Rádix Imago is for',
      resumo: 'An academic teaching and research platform with anonymized dental radiographs.',
      passos: [
        'Images are for study and research (UFSC). They are not used for diagnosis or patient reports.',
        'Every image is anonymized: no data that identifies the patient is available (LGPD).',
        'Each image goes through curation: a curator checks the anonymization and describes what the image shows.',
        'Only images approved in curation appear in the Image bank and Advanced search.',
      ],
      palavras: 'about purpose lgpd anonymized privacy diagnosis report teaching research',
    },
  },
  {
    id: 'tema',
    categoria: 'conta',
    pt: {
      titulo: 'Mudar para tema claro ou escuro',
      resumo: 'Por padrão o Rádix segue o tema do seu computador; o botão da lua/sol troca manualmente.',
      passos: [
        'Com um "A" pequeno no botão da lua/sol (topo da tela), o tema é automático: segue a configuração de aparência do seu computador ou celular.',
        'Clique no botão para escolher o tema oposto. Clique de novo para o outro tema, e mais uma vez para voltar ao automático.',
        'Passe o mouse no botão para ver qual tema está valendo.',
        'A escolha fica guardada neste navegador.',
      ],
      dica: 'Em sala com pouca luz, o tema escuro cansa menos; em ambiente bem iluminado, o claro costuma ser mais fácil de ler. Faça pausas: a cada 20 minutos, olhe para longe por 20 segundos.',
      palavras: 'tema claro escuro modo noturno automatico sistema cor fundo branco preto sol lua aparencia vista cansaco olhos',
    },
    en: {
      titulo: 'Switch between light and dark theme',
      resumo: 'By default Rádix follows your computer theme; the moon/sun button switches it manually.',
      passos: [
        'With a small "A" on the moon/sun button (top of the screen), the theme is automatic: it follows your computer or phone appearance setting.',
        'Click the button for the opposite theme. Click again for the other theme, and once more to go back to automatic.',
        'Hover the button to see which theme is active.',
        'Your choice is kept in this browser.',
      ],
      dica: 'In a dim room the dark theme is less tiring; in a well-lit place the light one is usually easier to read. Take breaks: every 20 minutes, look far away for 20 seconds.',
      palavras: 'theme light dark night mode automatic system color appearance sun moon eyes strain',
    },
  },
  {
    id: 'fotoPerfil',
    categoria: 'conta',
    pt: {
      titulo: 'Trocar ou remover a foto do perfil',
      resumo: 'Pelo seu nome, no canto superior direito, em "Meu perfil".',
      passos: [
        'Clique no seu nome, no canto superior direito.',
        'Escolha "Meu perfil".',
        'Clique para escolher uma foto (JPEG, PNG ou WEBP, até 5 MB) e depois em "Salvar foto".',
        'Para tirar a foto atual, use "Remover foto atual".',
      ],
      palavras: 'foto perfil avatar imagem do usuario trocar foto meu perfil retrato',
    },
    en: {
      titulo: 'Change or remove your profile photo',
      resumo: 'Click your name at the top right, then "My profile".',
      passos: [
        'Click your name at the top right corner.',
        'Choose "My profile".',
        'Pick a photo (JPEG, PNG or WEBP, up to 5 MB) and click "Save photo".',
        'To delete the current photo, use "Remove current photo".',
      ],
      palavras: 'photo profile avatar picture change',
    },
  },
  {
    id: 'sair',
    categoria: 'conta',
    pt: {
      titulo: 'Sair do sistema',
      resumo: 'Use "Sair" no menu da esquerda ou no menu do seu nome.',
      passos: [
        'Clique em "Sair", no fim do menu da esquerda (ou clique no seu nome, no topo, e em "Sair").',
        'Em computadores compartilhados (laboratório, clínica), sempre saia ao terminar.',
      ],
      palavras: 'sair logout deslogar encerrar sessao desconectar',
    },
    en: {
      titulo: 'Sign out',
      resumo: 'Use "Sign out" in the left menu or in your name menu.',
      passos: [
        'Click "Sign out" at the bottom of the left menu (or click your name at the top, then "Sign out").',
        'On shared computers (labs, clinics), always sign out when you finish.',
      ],
      palavras: 'sign out logout log off exit session',
    },
  },
  {
    id: 'senha',
    categoria: 'conta',
    pt: {
      titulo: 'Esqueci minha senha',
      resumo: 'Na tela de login, use "Esqueci minha senha".',
      passos: [
        'Na tela de login, clique em "Esqueci minha senha".',
        'Digite o e-mail do seu cadastro e clique em "Enviar instruções".',
        'Abra o e-mail recebido e siga o link para criar uma senha nova (mínimo de 8 caracteres).',
        'Não chegou? Confira a caixa de spam.',
      ],
      palavras: 'senha esqueci redefinir trocar senha recuperar acesso password',
    },
    en: {
      titulo: 'I forgot my password',
      resumo: 'On the login screen, use "Forgot my password".',
      passos: [
        'On the login screen, click "Forgot my password".',
        'Type your account e-mail and click "Send instructions".',
        'Open the e-mail and follow the link to create a new password (at least 8 characters).',
        'Nothing arrived? Check your spam folder.',
      ],
      palavras: 'password forgot reset recover change',
    },
  },
  {
    id: 'solicitarAcesso',
    categoria: 'conta',
    pt: {
      titulo: 'Como alguém novo pede acesso',
      resumo: 'Pelo formulário "Solicitar acesso", na tela de login.',
      passos: [
        'Na tela de login, clique em "Solicitar acesso".',
        'Preencha nome, e-mail, senha e o tipo de acesso desejado.',
        'Confirme o e-mail pelo link recebido (vale por 24 horas).',
        'Depois disso, um administrador revisa o pedido e libera o perfil.',
      ],
      palavras: 'cadastro cadastrar criar conta novo usuario solicitar acesso registro inscrever',
    },
    en: {
      titulo: 'How a new person requests access',
      resumo: 'Through the "Request access" form on the login screen.',
      passos: [
        'On the login screen, click "Request access".',
        'Fill in name, e-mail, password and the type of access wanted.',
        'Confirm the e-mail through the link received (valid for 24 hours).',
        'Then an administrator reviews the request and grants the profile.',
      ],
      palavras: 'sign up register create account new user request access',
    },
  },

  // ───────────── PESQUISA ─────────────
  {
    id: 'bancoImagens',
    categoria: 'pesquisa',
    rotas: ['/banco-imagens'],
    link: '/banco-imagens',
    pt: {
      titulo: 'Usar o Banco de imagens',
      resumo: 'Mostra as imagens aprovadas separadas por tipo de exame.',
      passos: [
        'No menu, clique em "Banco de imagens".',
        'Clique no cartão do tipo de exame (Periapical, Panorâmica, Interproximal, Oclusal...).',
        'As imagens aprovadas daquele tipo aparecem como resultado de pesquisa.',
        'Para filtrar mais (dente, achado, erro técnico...), use o botão "Busca avançada".',
      ],
      palavras: 'banco de imagens acervo categorias tipo de exame periapical panoramica interproximal oclusal tomografia ver imagens',
    },
    en: {
      titulo: 'Using the Image bank',
      resumo: 'Shows approved images grouped by exam type.',
      passos: [
        'In the menu, click "Image bank".',
        'Click the card of the exam type (Periapical, Panoramic, Bitewing, Occlusal...).',
        'The approved images of that type appear as search results.',
        'To filter further (tooth, finding, technical error...), use the "Advanced search" button.',
      ],
      palavras: 'image bank collection categories exam type periapical panoramic bitewing occlusal',
    },
  },
  {
    id: 'buscaAvancada',
    categoria: 'pesquisa',
    rotas: ['/pesquisa', '/banco-imagens'],
    link: '/pesquisa',
    pt: {
      titulo: 'Como usar a busca avançada',
      resumo: 'Combine filtros (dentes, tipo de exame, achado, erro técnico...) para achar imagens.',
      passos: [
        'Abra pelo botão "Busca avançada" do Banco de imagens.',
        'Escolha os filtros que quiser: tipo de exame, dentes, achado, região, erro técnico, qualidade, gênero, idade...',
        'Para procurar por texto, escreva em "Buscar por palavras" (aceita sem acento, plural e sinônimos).',
        'Clique em "Pesquisar". As imagens encontradas aparecem em cartões logo abaixo.',
        'Para recomeçar, clique em "Limpar filtros".',
      ],
      dica: 'Pelo teclado: Tab passa de um filtro para outro (o filtro em uso fica iluminado) e as setas ← → andam pelas opções daquele filtro.',
      palavras: 'busca avancada pesquisa avançada pesquisar procurar filtrar filtros encontrar imagens achado patologia lesao carie palavra texto como buscar',
    },
    en: {
      titulo: 'How to use the advanced search',
      resumo: 'Combine filters (teeth, exam type, finding, technical error...) to find images.',
      passos: [
        'Open it with the "Advanced search" button in the Image bank.',
        'Choose any filters: exam type, teeth, finding, region, technical error, quality, gender, age...',
        'To search by text, type in "Search by words" (accents, plurals and synonyms are handled).',
        'Click "Search". The images found appear as cards below.',
        'To start over, click "Clear filters".',
      ],
      dica: 'With the keyboard: Tab moves between filters (the current one is highlighted) and the ← → arrows move through its options.',
      palavras: 'advanced search filter find images finding pathology lesion caries word text',
    },
  },
  {
    id: 'buscaDentes',
    categoria: 'pesquisa',
    rotas: ['/pesquisa'],
    link: '/pesquisa',
    pt: {
      titulo: 'Buscar por dente ou grupo de dentes',
      resumo: 'Clique nos dentes do odontograma ou num grupo (incisivos, molares...).',
      passos: [
        'Na busca avançada, vá até "Dentes ou grupos de dentes (FDI)".',
        'Clique num grupo (Incisivos, Caninos, Pré-molares, Molares, Terceiros molares) para marcar todos os dentes dele de uma vez. Clique de novo para desmarcar.',
        'Ou clique em cada dente do odontograma (notação FDI, ex.: 36 = primeiro molar inferior esquerdo).',
        'Para desmarcar tudo, clique em "Limpar dentes".',
      ],
      palavras: 'dente dentes grupo odontograma fdi numero molar molares incisivo canino pre-molar terceiro siso arcada quadrante',
    },
    en: {
      titulo: 'Search by tooth or tooth group',
      resumo: 'Click teeth on the odontogram or a group (incisors, molars...).',
      passos: [
        'In the advanced search, go to "Teeth or tooth groups (FDI)".',
        'Click a group (Incisors, Canines, Premolars, Molars, Third molars) to select all its teeth at once. Click again to clear it.',
        'Or click each tooth on the odontogram (FDI notation, e.g. 36 = lower left first molar).',
        'To clear everything, click "Clear teeth".',
      ],
      palavras: 'tooth teeth group odontogram fdi molar incisor canine premolar wisdom',
    },
  },
  {
    id: 'buscaTipoErro',
    categoria: 'pesquisa',
    rotas: ['/pesquisa'],
    link: '/pesquisa',
    pt: {
      titulo: 'Filtrar por tipo de exame e erro técnico',
      resumo: 'Escolhendo o tipo de exame, a lista de erros técnicos mostra só os possíveis naquele exame.',
      passos: [
        'Na busca avançada, escolha o "Tipo de exame" (ou use o ícone de acesso rápido, no fim da linha do título).',
        'A caixa "Erro técnico" passa a mostrar só os erros que acontecem naquele tipo de exame.',
        'Escolha o erro e clique em "Pesquisar".',
      ],
      palavras: 'erro tecnico erros tipo de exame acesso rapido periapical panoramica corte de cone exposicao posicionamento',
    },
    en: {
      titulo: 'Filter by exam type and technical error',
      resumo: 'Once an exam type is chosen, the technical error list only shows errors possible in it.',
      passos: [
        'In the advanced search, choose the "Exam type" (or use the quick-access icon at the end of the title line).',
        'The "Technical error" box then lists only the errors that happen in that exam type.',
        'Choose the error and click "Search".',
      ],
      palavras: 'technical error exam type quick access cone cut exposure positioning',
    },
  },
  {
    id: 'resultados',
    categoria: 'pesquisa',
    rotas: ['/pesquisa', '/banco-imagens'],
    pt: {
      titulo: 'Selecionar resultados e ver em sequência',
      resumo: 'Marque as imagens e abra todas juntas no visualizador.',
      passos: [
        'Nos resultados, marque a caixinha no canto de cada imagem (ou use "Selecionar todas").',
        'Clique em "Ver N selecionadas em sequência" para abrir todas no visualizador.',
        'Passe o mouse no "i" de um cartão para ler a descrição da curadoria daquela imagem.',
        'Para desmarcar, use "Limpar seleção".',
      ],
      palavras: 'resultados selecionar marcar varias todas sequencia abrir imagens cartao informacao i descricao',
    },
    en: {
      titulo: 'Select results and view them in sequence',
      resumo: 'Tick the images and open them all together in the viewer.',
      passos: [
        'In the results, tick the box on the corner of each image (or use "Select all").',
        'Click "View N selected in sequence" to open them all in the viewer.',
        'Hover the "i" on a card to read the curation description of that image.',
        'To untick, use "Clear selection".',
      ],
      palavras: 'results select tick several all sequence open info description',
    },
  },
  {
    id: 'salvarMinhas',
    categoria: 'minhasImagens',
    rotas: ['/pesquisa', '/minhas-imagens'],
    pt: {
      titulo: 'Guardar imagens em Minhas imagens',
      resumo: 'Salve imagens da pesquisa na sua lista pessoal para estudar depois.',
      passos: [
        'Nos resultados da busca, selecione as imagens e use "Salvar em Minhas imagens".',
        'Ou, dentro do visualizador, clique em "★ Salvar no meu usuário".',
        'As imagens que já estavam na sua lista não são duplicadas.',
        'Depois, abra o menu "Minhas imagens" para encontrá-las.',
      ],
      palavras: 'salvar guardar favoritar favorito minhas imagens lista pessoal estrela adicionar',
    },
    en: {
      titulo: 'Keep images in My images',
      resumo: 'Save search images to your personal list to study later.',
      passos: [
        'In the search results, select the images and use "Save to My images".',
        'Or, inside the viewer, click "★ Save to my user".',
        'Images already in your list are not duplicated.',
        'Then open the "My images" menu to find them.',
      ],
      palavras: 'save keep favorite my images personal list star add',
    },
  },

  // ───────────── MINHAS IMAGENS ─────────────
  {
    id: 'minhasImagens',
    categoria: 'minhasImagens',
    rotas: ['/minhas-imagens'],
    link: '/minhas-imagens',
    pt: {
      titulo: 'Usar a tela Minhas imagens',
      resumo: 'Sua lista pessoal de imagens salvas, com descrição, expandir e remover.',
      passos: [
        'No menu, clique em "Minhas imagens".',
        'Clique no "i" de um cartão para abrir a descrição da imagem ao lado dele. A janela pode ser arrastada pela barra de cima e fecha com um clique.',
        'Clique no ícone de expandir (setas) para ver a imagem grande na metade esquerda da tela e a descrição na metade direita.',
        'Marque várias imagens e use "Ver selecionadas em sequência" para passar por elas no visualizador.',
      ],
      palavras: 'minhas imagens salvas lista pessoal expandir ampliar tela cheia informacao i descricao',
    },
    en: {
      titulo: 'Using the My images screen',
      resumo: 'Your personal list of saved images, with description, expand and remove.',
      passos: [
        'In the menu, click "My images".',
        'Click the "i" on a card to open the image description next to it. The window can be dragged by its top bar and closes with one click.',
        'Click the expand icon (arrows) to see the image large on the left half of the screen and the description on the right half.',
        'Tick several images and use "View selected in sequence" to go through them in the viewer.',
      ],
      palavras: 'my images saved personal list expand enlarge full screen info description',
    },
  },
  {
    id: 'removerMinhas',
    categoria: 'minhasImagens',
    rotas: ['/minhas-imagens'],
    link: '/minhas-imagens',
    pt: {
      titulo: 'Apagar (remover) uma imagem de Minhas imagens',
      resumo: 'Clique no "x" vermelho do cartão da imagem.',
      passos: [
        'Abra "Minhas imagens" no menu.',
        'No cartão da imagem, clique no "x" vermelho (canto de baixo, à direita).',
        'A imagem sai só da SUA lista. Ela continua no Banco de imagens e pode ser salva de novo quando quiser.',
      ],
      dica: 'Suas anotações sobre a imagem não são apagadas junto: se salvar a imagem de novo, elas continuam lá.',
      palavras: 'apagar remover excluir tirar deletar imagem minhas imagens x lista',
    },
    en: {
      titulo: 'Delete (remove) an image from My images',
      resumo: 'Click the red "x" on the image card.',
      passos: [
        'Open "My images" in the menu.',
        'On the image card, click the red "x" (bottom right corner).',
        'The image only leaves YOUR list. It stays in the Image bank and can be saved again anytime.',
      ],
      dica: 'Your notes about the image are not deleted with it: if you save it again, they are still there.',
      palavras: 'delete remove erase image my images x list',
    },
  },
  {
    id: 'emailImagens',
    categoria: 'compartilhar',
    rotas: ['/minhas-imagens', '/pesquisa'],
    pt: {
      titulo: 'Enviar imagens por e-mail',
      resumo: 'Pelo visualizador (uma imagem) ou por Minhas imagens (várias selecionadas).',
      passos: [
        'Uma imagem: no visualizador, clique em "✉ Enviar por e-mail". Ela vai para o e-mail do seu cadastro.',
        'Várias: em Minhas imagens, marque as imagens e clique em "✉ Enviar N selecionadas por e-mail".',
        'Tomografias (vários cortes) não vão por e-mail: use os botões de download (ZIP) no visualizador.',
      ],
      palavras: 'email e-mail enviar mandar correio mensagem imagens',
    },
    en: {
      titulo: 'Send images by e-mail',
      resumo: 'From the viewer (one image) or from My images (several selected).',
      passos: [
        'One image: in the viewer, click "✉ Send by e-mail". It goes to your account e-mail.',
        'Several: in My images, tick the images and click "✉ Send N selected by e-mail".',
        'CT scans (many slices) cannot go by e-mail: use the download (ZIP) buttons in the viewer.',
      ],
      palavras: 'email send mail message images',
    },
  },

  // ───────────── VISUALIZADOR ─────────────
  {
    id: 'visualizador',
    categoria: 'visualizador',
    pt: {
      titulo: 'Usar o visualizador de imagens',
      resumo: 'Abre a imagem em tamanho grande, com zoom, contraste e troca entre imagens.',
      passos: [
        'Abra uma imagem pelos resultados da pesquisa, por Minhas imagens ou por Compartilhadas comigo.',
        'Use a rolagem do mouse e as ferramentas do topo do visualizador para zoom, contraste, girar e medir.',
        'As setas ← → do teclado passam para a imagem anterior/seguinte.',
        'Esc fecha o visualizador. O botão "Tela cheia" ocupa a tela inteira.',
      ],
      dica: 'Tomografias têm vários cortes: use a rolagem do mouse ou Page Up / Page Down para percorrê-los.',
      palavras: 'visualizador ver imagem abrir ampliar zoom contraste girar medir ohif tela cheia setas teclado proxima anterior tomografia cortes',
    },
    en: {
      titulo: 'Using the image viewer',
      resumo: 'Opens the image large, with zoom, contrast and switching between images.',
      passos: [
        'Open an image from the search results, My images or Shared with me.',
        'Use the mouse wheel and the tools at the top of the viewer for zoom, contrast, rotate and measure.',
        'The ← → keys go to the previous/next image.',
        'Esc closes the viewer. The "Full screen" button fills the whole screen.',
      ],
      dica: 'CT scans have many slices: use the mouse wheel or Page Up / Page Down to scroll through them.',
      palavras: 'viewer open image zoom contrast rotate measure ohif full screen arrows keyboard next previous ct slices',
    },
  },
  {
    id: 'layoutVisualizador',
    categoria: 'visualizador',
    pt: {
      titulo: 'Ver várias imagens lado a lado',
      resumo: 'Escolha o layout da tela (quantas imagens ao mesmo tempo).',
      passos: [
        'No visualizador, abra o botão de layout da tela.',
        'Escolha um layout pronto ou, em "Personalizar", passe o mouse na grade e clique em linhas × colunas.',
        'Cada quadro mostra uma das imagens selecionadas.',
      ],
      palavras: 'layout lado a lado varias imagens grade comparar duas quatro quadros mosaico',
    },
    en: {
      titulo: 'View several images side by side',
      resumo: 'Choose the screen layout (how many images at once).',
      passos: [
        'In the viewer, open the screen layout button.',
        'Pick a ready layout or, under "Customize", hover the grid and click rows × columns.',
        'Each frame shows one of the selected images.',
      ],
      palavras: 'layout side by side several images grid compare',
    },
  },
  {
    id: 'marcacoesCurador',
    categoria: 'visualizador',
    pt: {
      titulo: 'Ver as marcações e a descrição do curador',
      resumo: 'O "i" mostra a descrição; a tecla K liga e desliga as marcações na imagem.',
      passos: [
        'No visualizador, clique no selo "i" no canto da imagem para abrir a descrição da curadoria (tipo, dentes, achado, alterações, descrição...).',
        'O número ao lado do "i" é a quantidade de marcações feitas pelo curador.',
        'Aperte K (ou use o botão de marcação) para mostrar ou esconder as marcações sobre a imagem.',
        'Na descrição, passe o mouse em "Marcação N" para destacá-la; clique para ver só ela.',
      ],
      palavras: 'marcacao marcacoes curador lesao marcada descricao informacoes i tecla k mostrar esconder achado',
    },
    en: {
      titulo: "See the curator's markings and description",
      resumo: 'The "i" shows the description; the K key turns markings on and off.',
      passos: [
        'In the viewer, click the "i" badge on the image corner to open the curation description (type, teeth, finding, changes, description...).',
        'The number next to the "i" is how many markings the curator made.',
        'Press K (or use the marking button) to show or hide the markings on the image.',
        'In the description, hover "Marking N" to highlight it; click to see only that one.',
      ],
      palavras: 'marking markings curator lesion description info i key k show hide finding',
    },
  },
  {
    id: 'baixar',
    categoria: 'impressao',
    pt: {
      titulo: 'Baixar imagens (download)',
      resumo: 'Pelo visualizador ou pelo menu "Salvar como" dos resultados.',
      passos: [
        'Uma imagem: no visualizador, clique em "⬇ Baixar".',
        'Tomografias: use "⬇ Baixar imagens (ZIP)" ou "⬇ Baixar DICOM (ZIP)".',
        'Várias: nos resultados da pesquisa, use "Salvar como" e escolha ZIP ou PDF, com ou sem a descrição da curadoria.',
      ],
      dica: 'O material é só para ensino e pesquisa: não compartilhe fora do contexto acadêmico.',
      palavras: 'baixar download salvar arquivo zip pdf dicom exportar computador',
    },
    en: {
      titulo: 'Download images',
      resumo: 'From the viewer or the "Save as" menu in the results.',
      passos: [
        'One image: in the viewer, click "⬇ Download".',
        'CT scans: use "⬇ Download images (ZIP)" or "⬇ Download DICOM (ZIP)".',
        'Several: in the search results, use "Save as" and pick ZIP or PDF, with or without the curation description.',
      ],
      dica: 'The material is for teaching and research only: do not share it outside the academic context.',
      palavras: 'download save file zip pdf dicom export',
    },
  },
  {
    id: 'imprimir',
    categoria: 'impressao',
    rotas: ['/pesquisa'],
    pt: {
      titulo: 'Imprimir imagens ou salvar em PDF',
      resumo: 'Botão "Imprimir": com a descrição (2 por página) ou só as imagens (4 por página).',
      passos: [
        'Nos resultados da pesquisa (ou no visualizador), clique em "Imprimir".',
        'Escolha "Todas as encontradas" ou "Somente as selecionadas", com ou sem a descrição da curadoria.',
        'Na janela que abrir, escolha a impressora. Para PDF, em "Destino" escolha "Salvar como PDF".',
        'Todas as páginas saem com o aviso de uso acadêmico.',
      ],
      dica: 'A impressão leva a descrição da curadoria, não as suas anotações pessoais.',
      palavras: 'imprimir impressao impressora papel pdf folha pagina',
    },
    en: {
      titulo: 'Print images or save as PDF',
      resumo: '"Print" button: with the description (2 per page) or images only (4 per page).',
      passos: [
        'In the search results (or the viewer), click "Print".',
        'Choose "All found" or "Only selected", with or without the curation description.',
        'In the window that opens, pick the printer. For PDF, under "Destination" choose "Save as PDF".',
        'Every page carries the academic-use notice.',
      ],
      dica: 'Printing includes the curation description, not your personal notes.',
      palavras: 'print printer paper pdf page',
    },
  },

  // ───────────── ANOTACOES ─────────────
  {
    id: 'fazerAnotacao',
    categoria: 'anotacoes',
    rotas: ['/minhas-imagens', '/compartilhadas-comigo'],
    pt: {
      titulo: 'Fazer anotações numa imagem',
      resumo: 'Na janela de informações (o "i"), em "Minhas anotações", clique no lápis.',
      passos: [
        'Abra a janela de informações da imagem clicando no "i".',
        'Em "Minhas anotações", clique no ícone de lápis.',
        'Escreva a anotação e clique em "Salvar" (ou Ctrl+Enter).',
        'Para mudar uma anotação, clique no texto dela.',
      ],
      dica: 'Suas anotações são privadas: só você as vê, a não ser que compartilhe a imagem com alguém.',
      palavras: 'anotacao anotacoes nota notas anotar escrever comentario observacao lapis estudo minhas anotacoes',
    },
    en: {
      titulo: 'Write notes on an image',
      resumo: 'In the information window (the "i"), under "My notes", click the pencil.',
      passos: [
        'Open the image information window by clicking the "i".',
        'Under "My notes", click the pencil icon.',
        'Write the note and click "Save" (or Ctrl+Enter).',
        'To change a note, click its text.',
      ],
      dica: 'Your notes are private: only you see them, unless you share the image with someone.',
      palavras: 'note notes write comment observation pencil study my notes',
    },
  },
  {
    id: 'apagarAnotacao',
    categoria: 'anotacoes',
    rotas: ['/minhas-imagens', '/compartilhadas-comigo'],
    pt: {
      titulo: 'Apagar anotações',
      resumo: 'Clique na lixeira ao lado da anotação e clique de novo para confirmar.',
      passos: [
        'Abra a janela de informações da imagem (o "i").',
        'Em "Minhas anotações", clique na lixeira ao lado da anotação.',
        'O botão fica vermelho escrito "Apagar?": clique nele de novo para confirmar.',
        'Para apagar todas de uma vez, use "Apagar todas" (também pede o segundo clique).',
        'Com uma anotação aberta para edição, o botão "Apagar" também aparece ao lado de Cancelar e Salvar.',
      ],
      dica: 'Útil para anotações provisórias: apague o que não quer mais guardar.',
      palavras: 'apagar anotacao anotacoes excluir remover deletar nota lixeira tirar limpar apagar todas',
    },
    en: {
      titulo: 'Delete notes',
      resumo: 'Click the bin next to the note, then click again to confirm.',
      passos: [
        'Open the image information window (the "i").',
        'Under "My notes", click the bin next to the note.',
        'The button turns red reading "Delete?": click it again to confirm.',
        'To delete all at once, use "Delete all" (it also asks for a second click).',
        'While a note is open for editing, a "Delete" button also appears next to Cancel and Save.',
      ],
      dica: 'Handy for temporary notes: delete what you no longer want to keep.',
      palavras: 'delete note notes remove erase bin clear delete all',
    },
  },
  {
    id: 'anotacaoNaImagem',
    categoria: 'anotacoes',
    pt: {
      titulo: 'Marcar um ponto ou desenhar uma seta na imagem',
      resumo: 'No visualizador, use "+ Anotação" para escrever em cima da imagem.',
      passos: [
        'No visualizador (com uma imagem por tela), clique em "+ Anotação".',
        'Clique na imagem para marcar um ponto, ou clique e arraste para desenhar uma seta até o local exato.',
        'Escreva o texto, escolha a cor e, se quiser, "📌 Texto sempre visível". Clique em "Salvar".',
        'Para apagar, passe o mouse na anotação e clique no "x" vermelho; para editar, clique nela.',
      ],
      palavras: 'anotacao na imagem ponto seta desenhar marcar local cor texto sempre visivel pino',
    },
    en: {
      titulo: 'Mark a point or draw an arrow on the image',
      resumo: 'In the viewer, use "+ Note" to write on top of the image.',
      passos: [
        'In the viewer (one image per screen), click "+ Note".',
        'Click the image to mark a point, or click and drag to draw an arrow to the exact spot.',
        'Write the text, pick a color and, if you want, "📌 Text always visible". Click "Save".',
        'To delete, hover the note and click the red "x"; to edit, click it.',
      ],
      palavras: 'note on image point arrow draw mark spot color pin',
    },
  },

  // ───────────── COMPARTILHAR ─────────────
  {
    id: 'compartilhar',
    categoria: 'compartilhar',
    pt: {
      titulo: 'Compartilhar uma imagem com outra pessoa',
      resumo: 'Na janela de informações (o "i"), use "Compartilhar" e digite o e-mail da pessoa.',
      passos: [
        'Abra a janela de informações da imagem no visualizador (o "i").',
        'Clique em "Compartilhar", digite o e-mail do cadastro da pessoa e, se quiser, um recado.',
        'A pessoa vê a imagem e as suas anotações (só leitura) em "Compartilhadas comigo".',
        'Para desfazer, abra "Compartilhar" de novo e clique em "desfazer" ao lado do nome.',
      ],
      dica: 'Se a pessoa ainda não tem cadastro, copie o link mostrado e envie a ela; depois da aprovação, compartilhe de novo.',
      palavras: 'compartilhar enviar para colega professor aluno mostrar dividir mandar imagem anotacoes desfazer',
    },
    en: {
      titulo: 'Share an image with someone',
      resumo: 'In the information window (the "i"), use "Share" and type the person\'s e-mail.',
      passos: [
        'Open the image information window in the viewer (the "i").',
        'Click "Share", type the person\'s account e-mail and, if you want, a message.',
        'They see the image and your notes (read-only) in "Shared with me".',
        'To undo, open "Share" again and click "undo" next to the name.',
      ],
      dica: 'If the person has no account yet, copy the link shown and send it; after approval, share again.',
      palavras: 'share send colleague teacher student show image notes undo',
    },
  },
  {
    id: 'compartilhadasComigo',
    categoria: 'compartilhar',
    rotas: ['/compartilhadas-comigo'],
    link: '/compartilhadas-comigo',
    pt: {
      titulo: 'Ver e remover imagens compartilhadas comigo',
      resumo: 'O menu "Compartilhadas comigo" lista o que outros usuários enviaram para você.',
      passos: [
        'No menu, clique em "Compartilhadas comigo" (o número indica quantas são novas).',
        'Clique em "⛶ Abrir" para ver a imagem com as anotações de quem enviou.',
        'Para tirar uma imagem da sua lista, clique em "Remover".',
      ],
      palavras: 'compartilhadas comigo recebidas recebi enviaram para mim remover apagar abrir anotacoes colega',
    },
    en: {
      titulo: 'View and remove images shared with me',
      resumo: 'The "Shared with me" menu lists what other users sent you.',
      passos: [
        'In the menu, click "Shared with me" (the number shows how many are new).',
        'Click "⛶ Open" to see the image with the sender\'s notes.',
        'To take an image off your list, click "Remove".',
      ],
      palavras: 'shared with me received remove delete open notes',
    },
  },

  // ───────────── CURADORIA (curador / administrador) ─────────────
  {
    id: 'curadoria',
    categoria: 'curadoria',
    perfis: CUR,
    rotas: ['/curadoria'],
    link: '/curadoria',
    pt: {
      titulo: 'Fazer a curadoria de uma imagem',
      resumo: 'Imagem na metade esquerda, ficha de curadoria na direita; o holofote mostra o item da vez.',
      passos: [
        'No menu, clique em "Curadoria": a primeira imagem da fila já abre.',
        'O holofote ilumina um item por vez, começando por "Anonimização validada".',
        'Preencha o item (tipo, dentes, achado, alterações, erro técnico, descrição...). ↑ ↓ ou Tab passam de um item para outro.',
        'No fim da ficha estão "Salvar", "Aprovar" e "Solicitar segunda opinião". No item "Aprovar", Enter aprova (antes, o Rádix confere se falta algo).',
        'Use "← Imagem X de Y →", ao lado do microfone, para trocar de imagem.',
      ],
      dica: 'Aprovar é sempre manual: nada é aprovado sozinho, nem por voz nem por macro.',
      palavras: 'curadoria curar ficha laudar aprovar salvar holofote preencher anonimizacao validada proxima imagem',
    },
    en: {
      titulo: 'Curating an image',
      resumo: 'Image on the left half, curation form on the right; the spotlight shows the current item.',
      passos: [
        'In the menu, click "Curation": the first image in the queue opens.',
        'The spotlight lights one item at a time, starting with "Anonymization validated".',
        'Fill in the item (type, teeth, finding, changes, technical error, description...). ↑ ↓ or Tab move between items.',
        'At the end of the form are "Save", "Approve" and "Request second opinion". On the "Approve" item, Enter approves (Rádix first checks if anything is missing).',
        'Use "← Image X of Y →", next to the microphone, to switch images.',
      ],
      dica: 'Approving is always manual: nothing is approved by itself, not by voice nor by macro.',
      palavras: 'curation curate form report approve save spotlight anonymization next image',
    },
  },
  {
    id: 'curadoriaTeclado',
    categoria: 'curadoria',
    perfis: CUR,
    rotas: ['/curadoria'],
    pt: {
      titulo: 'Atalhos de teclado da curadoria',
      resumo: 'Curadoria toda pelo teclado, sem mouse.',
      passos: [
        'Espaço: abre ou pausa o microfone (curadoria por voz).',
        '↑ ↓ ou Tab: passam para o item seguinte/anterior da ficha.',
        '← →: trocam a opção do item iluminado (tipo, gênero, qualidade) ou andam pelas opções (dentes, erros técnicos).',
        'Enter: marca a opção do cursor (dentes, erros) e, no item "Aprovar", faz a aprovação final.',
      ],
      palavras: 'teclado atalhos teclas espaco enter setas tab curadoria rapida sem mouse',
    },
    en: {
      titulo: 'Curation keyboard shortcuts',
      resumo: 'The whole curation by keyboard, no mouse.',
      passos: [
        'Space: opens or pauses the microphone (voice curation).',
        '↑ ↓ or Tab: go to the next/previous form item.',
        '← →: change the option of the lit item (type, gender, quality) or move through options (teeth, technical errors).',
        'Enter: ticks the cursor option (teeth, errors) and, on the "Approve" item, makes the final approval.',
      ],
      palavras: 'keyboard shortcuts keys space enter arrows tab fast',
    },
  },
  {
    id: 'curadoriaVoz',
    categoria: 'curadoria',
    perfis: CUR,
    rotas: ['/curadoria'],
    pt: {
      titulo: 'Curadoria por voz',
      resumo: 'Aperte Espaço, fale o item iluminado e o holofote passa sozinho para o próximo.',
      passos: [
        'Na curadoria, aperte Espaço (ou clique no círculo do microfone) para abrir o microfone.',
        'Fale o valor do item iluminado, por exemplo: "ok" (anonimização), "pan" (tipo), "dentes 36 e 37", "qualidade boa".',
        'Faça uma pausa curta: o Rádix entende, preenche e o holofote passa para o próximo item.',
        'Para dizer que não há nada: "não", "sem erro técnico", "sem descrição" ou "sem observações".',
        'Texto corrido: "descrição: ..." e termine com "fim". Comandos: "desfazer", "salvar", "próxima seção".',
      ],
      dica: 'O áudio é transcrito no próprio servidor do Rádix e não é guardado. Palavras parecidas viram uma dúvida para você confirmar.',
      palavras: 'voz falar microfone audio ditar ditado comando fala whisper espaco reconhecimento',
    },
    en: {
      titulo: 'Voice curation',
      resumo: 'Press Space, say the lit item and the spotlight moves on by itself.',
      passos: [
        'In curation, press Space (or click the microphone circle) to open the microphone.',
        'Say the value of the lit item, e.g. "ok" (anonymization), "pan" (type), "teeth 36 and 37", "quality good".',
        'Pause briefly: Rádix understands, fills it in and the spotlight goes to the next item.',
        'To say there is nothing: "no", "no technical error", "no description" or "no remarks".',
        'Free text: "description: ..." and end with "end". Commands: "undo", "save", "next section".',
      ],
      dica: 'Audio is transcribed on the Rádix server itself and is not stored. Similar words become a question for you to confirm.',
      palavras: 'voice speak microphone audio dictate command whisper space recognition',
    },
  },
  {
    id: 'macrosComoLaudar',
    categoria: 'curadoria',
    perfis: CUR,
    rotas: ['/curadoria', '/macros'],
    pt: {
      titulo: 'Usar macros e o guia "Como laudar"',
      resumo: 'Macros preenchem a ficha com frases prontas; "Como laudar" mostra o passo a passo.',
      passos: [
        'Ao lado do microfone, clique em "⚡ Macros" e escolha a frase pronta (ou fale "macro <nome>").',
        'A macro só preenche o rascunho: confira e aprove manualmente.',
        '"Como laudar" abre um guia em passos; as setas ← → passam as páginas e Esc fecha.',
        'Para criar ou editar macros, use o menu "Macros".',
      ],
      palavras: 'macro macros frase pronta modelo como laudar guia passo a passo laudo',
    },
    en: {
      titulo: 'Using macros and the "How to report" guide',
      resumo: 'Macros fill the form with ready phrases; "How to report" shows the steps.',
      passos: [
        'Next to the microphone, click "⚡ Macros" and pick the ready phrase (or say "macro <name>").',
        'A macro only fills the draft: check it and approve manually.',
        '"How to report" opens a step guide; ← → change pages and Esc closes.',
        'To create or edit macros, use the "Macros" menu.',
      ],
      palavras: 'macro macros ready phrase template how to report guide',
    },
  },
  {
    id: 'descartarSegunda',
    categoria: 'curadoria',
    perfis: CUR,
    rotas: ['/curadoria', '/segunda-opiniao'],
    link: '/segunda-opiniao',
    pt: {
      titulo: 'Descartar uma imagem ou pedir segunda opinião',
      resumo: '"Descartar" fica ao lado de Macros; "Solicitar segunda opinião" fica no fim da ficha.',
      passos: [
        'Imagem sem condição de uso: clique em "Descartar" (ao lado de Macros) e informe o motivo.',
        'Em dúvida: no fim da ficha, clique em "Solicitar segunda opinião" e explique o motivo.',
        'Outro curador responde no menu "Segunda opinião", escolhendo "Concordar com o curador" ou "Discordar".',
      ],
      palavras: 'descartar descarte excluir imagem ruim segunda opiniao duvida outro curador concordar discordar parecer',
    },
    en: {
      titulo: 'Discard an image or ask for a second opinion',
      resumo: '"Discard" is next to Macros; "Request second opinion" is at the end of the form.',
      passos: [
        'Unusable image: click "Discard" (next to Macros) and give the reason.',
        'In doubt: at the end of the form, click "Request second opinion" and explain why.',
        'Another curator answers in the "Second opinion" menu, choosing "Agree with the curator" or "Disagree".',
      ],
      palavras: 'discard bad image second opinion doubt another curator agree disagree',
    },
  },
  {
    id: 'enviarDicom',
    categoria: 'curadoria',
    perfis: ENVIO,
    rotas: ['/imagens'],
    link: '/imagens',
    pt: {
      titulo: 'Enviar uma imagem DICOM nova',
      resumo: 'Em "Imagens recebidas", use "Enviar imagem DICOM".',
      passos: [
        'No menu, clique em "Imagens recebidas".',
        'Em "Enviar imagem DICOM", escolha o arquivo e clique em "Enviar imagem".',
        'A imagem é anonimizada automaticamente antes de ficar disponível, e o envio fica registrado na auditoria.',
        'Depois ela aparece na fila da curadoria. A lista mostra o status de anonimização e de curadoria.',
      ],
      palavras: 'enviar upload carregar subir dicom imagem nova importar imagens recebidas arquivo',
    },
    en: {
      titulo: 'Upload a new DICOM image',
      resumo: 'In "Received images", use "Send DICOM image".',
      passos: [
        'In the menu, click "Received images".',
        'Under "Send DICOM image", pick the file and click "Send image".',
        'The image is anonymized automatically before it becomes available, and the upload is logged in the audit trail.',
        'It then shows up in the curation queue. The list shows anonymization and curation status.',
      ],
      palavras: 'send upload dicom new image import received images file',
    },
  },
  {
    id: 'vocabulario',
    categoria: 'curadoria',
    perfis: CUR,
    rotas: ['/vocabulario'],
    link: '/vocabulario',
    pt: {
      titulo: 'Vocabulário controlado',
      resumo: 'Transforma textos livres repetidos em termos oficiais (filtro de busca e voz).',
      passos: [
        'No menu, clique em "Vocabulário".',
        'Em "Termos livres mais usados", clique em "Promover" no texto que deve virar termo oficial.',
        'Informe categoria e sinônimos e clique em "Criar termo".',
        'Confira as fichas sugeridas e ligue ao termo. Nada vira oficial sem a sua aprovação.',
      ],
      palavras: 'vocabulario termo oficial sinonimo sinonimos padronizar promover termos livres',
    },
    en: {
      titulo: 'Controlled vocabulary',
      resumo: 'Turns repeated free texts into official terms (search filter and voice).',
      passos: [
        'In the menu, click "Vocabulary".',
        'Under "Most used free terms", click "Promote" on the text that should become official.',
        'Enter category and synonyms and click "Create term".',
        'Check the suggested forms and link them. Nothing becomes official without your approval.',
      ],
      palavras: 'vocabulary official term synonym standardize promote free terms',
    },
  },
  {
    id: 'relatorios',
    categoria: 'administracao',
    perfis: CUR,
    rotas: ['/relatorios'],
    link: '/relatorios',
    pt: {
      titulo: 'Relatórios e indicadores',
      resumo: 'Números da curadoria: fichas por status, tipo, achado, curador e suas estatísticas do mês.',
      passos: [
        'No menu, clique em "Relatórios".',
        'Veja os totais e os gráficos de fichas por status, tipo de radiografia, achado, dificuldade e qualidade.',
        'Em "Minhas estatísticas" aparecem as suas aprovações do mês e a sua posição (sem mostrar o desempenho dos outros).',
      ],
      palavras: 'relatorio relatorios indicadores estatisticas numeros graficos produtividade quantidade',
    },
    en: {
      titulo: 'Reports and indicators',
      resumo: 'Curation numbers: forms by status, type, finding, curator and your monthly stats.',
      passos: [
        'In the menu, click "Reports".',
        'See totals and charts of forms by status, radiograph type, finding, difficulty and quality.',
        '"My statistics" shows your approvals this month and your rank (others\' performance is not shown).',
      ],
      palavras: 'reports indicators statistics numbers charts productivity',
    },
  },

  // ───────────── ADMINISTRACAO ─────────────
  {
    id: 'usuarios',
    categoria: 'administracao',
    perfis: ADM,
    rotas: ['/usuarios'],
    link: '/usuarios',
    pt: {
      titulo: 'Aprovar pedidos de acesso e gerenciar usuários',
      resumo: 'Na tela "Usuários": aprovar, rejeitar, criar, editar, bloquear e excluir.',
      passos: [
        'No menu, clique em "Usuários".',
        'Em "Solicitações de acesso pendentes", clique em "Aprovar" (escolhendo o perfil) ou "Rejeitar" (com o motivo).',
        'Use "Novo usuário" para cadastrar alguém diretamente.',
        'Na lista, use "Editar", "Bloquear/Ativar" ou "Excluir". O histórico de excluídos fica em "Ver usuários excluídos".',
      ],
      palavras: 'usuarios usuario aprovar rejeitar pedido solicitacao acesso perfil bloquear desbloquear excluir criar cadastro novo',
    },
    en: {
      titulo: 'Approve access requests and manage users',
      resumo: 'On the "Users" screen: approve, reject, create, edit, block and delete.',
      passos: [
        'In the menu, click "Users".',
        'Under "Pending access requests", click "Approve" (choosing the profile) or "Reject" (with the reason).',
        'Use "New user" to register someone directly.',
        'In the list, use "Edit", "Block/Activate" or "Delete". Deleted users are kept under "See deleted users".',
      ],
      palavras: 'users approve reject request access profile block unblock delete create',
    },
  },
  {
    id: 'auditoria',
    categoria: 'administracao',
    perfis: ADM,
    rotas: ['/auditoria'],
    link: '/auditoria',
    pt: {
      titulo: 'Consultar a auditoria',
      resumo: 'Registro de quem fez o quê e quando (login, envios, curadoria, usuários).',
      passos: [
        'No menu, clique em "Auditoria".',
        'Filtre por ação, resultado e período (data inicial e final) e clique em "Filtrar".',
        'Clique em "Detalhes" numa linha para ver o registro completo.',
      ],
      palavras: 'auditoria log registro historico seguranca rastreabilidade quem fez acesso login falha',
    },
    en: {
      titulo: 'Checking the audit trail',
      resumo: 'Record of who did what and when (logins, uploads, curation, users).',
      passos: [
        'In the menu, click "Audit".',
        'Filter by action, result and period (start and end date) and click "Filter".',
        'Click "Details" on a row to see the full record.',
      ],
      palavras: 'audit log record history security traceability login failure',
    },
  },
  {
    id: 'painelIntegracoes',
    categoria: 'administracao',
    perfis: ADM,
    rotas: ['/painel-admin', '/integracoes', '/configuracoes'],
    link: '/painel-admin',
    pt: {
      titulo: 'Painel administrativo, integrações e configurações',
      resumo: 'Visão geral da plataforma e situação dos serviços (Orthanc, OHIF, API...).',
      passos: [
        '"Painel administrativo": totais, alertas de segurança e atalhos de gestão.',
        '"Integrações": mostra se cada serviço está online. Use "Atualizar status" para checar de novo.',
        '"Configurações": mostra os parâmetros do servidor (só leitura; mudanças pedem suporte técnico).',
      ],
      palavras: 'painel administrativo integracoes configuracoes servicos status online orthanc ohif servidor alerta',
    },
    en: {
      titulo: 'Admin panel, integrations and settings',
      resumo: 'Platform overview and service status (Orthanc, OHIF, API...).',
      passos: [
        '"Admin panel": totals, security alerts and management shortcuts.',
        '"Integrations": shows whether each service is online. Use "Refresh status" to check again.',
        '"Settings": shows server parameters (read-only; changes need technical support).',
      ],
      palavras: 'admin panel integrations settings services status online orthanc ohif server alert',
    },
  },
]
