window.config = {
    routerBasename: '/',
    showStudyList: true,
    // Nao mostrar a faixa azul "for investigational use only" do OHIF por
    // cima da imagem: o RADIX IMAGO ja exibe o proprio aviso (uso
    // exclusivo para ensino e pesquisa, nao destinado a diagnostico) e a
    // faixa cobria a parte de baixo da radiografia na Curadoria.
    investigationalUseDialog: { option: 'never' },
    // ---------------------------------------------------------------
    // IDENTIDADE VISUAL DO RADIX IMAGO DENTRO DO OHIF
    // Logo do Radix no lugar do logo do OHIF (whiteLabeling e o recurso
    // oficial do OHIF para isso). O tema de cores e aplicado mais abaixo,
    // fora deste objeto, por uma folha de estilo injetada pelo proprio
    // app-config.js (que e carregado no <head> antes do OHIF iniciar).
    // ---------------------------------------------------------------
    whiteLabeling: {
    createLogoComponentFn: function (React) {
    return React.createElement(
    'span',
    { style: { display: 'flex', alignItems: 'center', gap: '10px', color: '#F8FAFC', fontWeight: 700, fontSize: '18px', letterSpacing: '.03em', fontFamily: 'Inter, system-ui, sans-serif' } },
    React.createElement('span', { style: { width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', display: 'grid', placeItems: 'center' } },
    React.createElement('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: '#fff' },
    React.createElement('rect', { x: 5, y: 5, width: 14, height: 2.6, rx: 1.3 }),
    React.createElement('rect', { x: 5, y: 9.4, width: 14, height: 2.6, rx: 1.3, opacity: 0.85 }),
    React.createElement('rect', { x: 7, y: 13.8, width: 10, height: 2.6, rx: 1.3, opacity: 0.7 }),
    React.createElement('rect', { x: 10, y: 18, width: 4, height: 2.2, rx: 1.1 }))),
    'RÁDIX IMAGO'
    );
    },
    },
    extensions: [],
    modes: [],
    // Pre-carrega em segundo plano os proximos cortes de uma serie (ex.:
    // tomografia/ressonancia com varios cortes) enquanto o usuario ainda
    // esta olhando o corte atual - sem isso, o OHIF so busca cada corte no
    // instante exato em que o usuario chega nele, o que deixa a navegacao
    // (rolar o mouse pra ver os cortes seguintes) mais lenta/travada.
    studyPrefetcher: {
    enabled: true,
    displaySetsCount: 3,
    maxNumPrefetchRequests: 10,
    order: 'closest'
    },
    dataSources: [
    {
    namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    sourceName: 'dicomweb',
    configuration: {
    friendlyName: 'Radix Imago - Orthanc',
    name: 'orthanc',
    // MESMA ORIGEM do OHIF (porta 3001): o nginx do OHIF repassa /dicom-web
    // e /wado ao proxy do Orthanc (ohif/radix-dicomweb.conf). Assim o
    // navegador manda o cookie de login do Radix junto e a portaria das
    // imagens decide quem ve o que. (O OHIF 3.9.2 NAO manda cookie para
    // outra porta - withCredentials fica desligado no dicomweb-client.)
    wadoUriRoot: window.location.origin + '/wado',
    qidoRoot: window.location.origin + '/dicom-web',
    wadoRoot: window.location.origin + '/dicom-web',
    qidoSupportsIncludeField: false,
    supportsReject: false,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    enableStudyLazyLoad: true,
    supportsFuzzyMatching: false,
    supportsWildcard: true,
    staticWado: false,
    singlepart: 'bulkdata,video',
    // SEM senha aqui: este arquivo e entregue a qualquer navegador. A senha
    // do Orthanc fica so no proxy (porta 8042), que antes consulta o login
    // do Radix (ver orthanc/cors-proxy.conf.template). O OHIF v3.9.2 nem
    // lia este campo; ele so expunha a senha (OWASP ASVS 13.3.2).
    }
    }
    ],
    defaultDataSourceName: 'dicomweb'
   }

// ---------------------------------------------------------------------
// TEMA RADIX IMAGO PARA O OHIF
// O OHIF roda em outra origem (porta 3001), entao o CSS do Radix nao
// alcanca o que esta dentro do iframe. Este bloco, que roda no proprio
// OHIF (app-config.js e carregado no <head>), injeta uma folha de estilo
// que troca a paleta azul-marinho padrao do OHIF pela paleta do Radix
// (ardosia + turquesa). So cores/bordas: nenhum comportamento muda, e a
// area da imagem continua preta (padrao para leitura de radiografias).
// ---------------------------------------------------------------------
;(function () {
  var css = [
    'html:root{--background:210 30% 8%;--card:210 28% 12%;--popover:212 26% 15%;--muted:210 28% 12%;--muted-foreground:214 25% 78%;',
    '--primary:172 66% 50%;--highlight:171 77% 64%;--secondary:175 77% 30%;--secondary-foreground:171 60% 85%;',
    '--accent:209 27% 18%;--input:213 22% 22%;--ring:172 66% 50%;--border:212 20% 24%}',
    'body,#root{background:#0E141A!important;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    // fundos (legado do OHIF)
    '.bg-primary-dark,.hover\\:bg-primary-dark:hover,.bg-bkg-med{background-color:#121A22!important}',
    '.bg-secondary-dark,.hover\\:bg-secondary-dark:hover{background-color:#18212B!important}',
    '.bg-bkg-low{background-color:#0B1116!important}',
    '.bg-indigo-dark{background-color:#1A2530!important}',
    '.bg-secondary-main,.hover\\:bg-secondary-main:hover{background-color:#22303C!important}',
    '.bg-secondary-light,.hover\\:bg-secondary-light:hover,.bg-inputfield-main{background-color:#2A3542!important}',
    '.hover\\:bg-secondary-light\\/60:hover{background-color:rgba(42,53,66,.6)!important}',
    '.bg-primary-main,.hover\\:bg-primary-main:hover{background-color:#0F766E!important}',
    '.bg-primary-light,.hover\\:bg-primary-light:hover,.bg-primary-active{background-color:#2DD4BF!important}',
    // textos
    '.text-primary-light,.hover\\:text-primary-light:hover{color:#5EEAD4!important}',
    '.text-primary-active,.hover\\:text-primary-active:hover,.text-actions-primary{color:#2DD4BF!important}',
    '.text-primary-main{color:#14B8A6!important}',
    '.text-aqua-pale{color:#A9BCCF!important}',
    '.text-secondary-light{color:#94A3B8!important}',
    '.text-common-light{color:#C3CEDB!important}',
    // bordas
    '.border-primary-light,.hover\\:border-primary-light:hover,.border-primary-active{border-color:#2DD4BF!important}',
    '.border-primary-main{border-color:#0F766E!important}',
    '.border-primary-dark,.border-secondary-dark{border-color:#121A22!important}',
    '.border-secondary-light,.hover\\:border-secondary-light:hover,.border-inputfield-main,.border-secondary-main{border-color:#2F3B48!important}',
    '.border-secondary-light\\/60{border-color:rgba(47,59,72,.6)!important}',
    // contorno do viewport ativo: turquesa fino em vez do ciano forte
    '.border-primary-light.border-2,.border-primary-light{box-shadow:none}',
    // barras de rolagem discretas
    '*{scrollbar-color:#2F3B48 transparent}',
    // SETA "<" AO LADO DO RADIX IMAGO (pedido de 27/10/2026): some. Ela
    // levava a lista de estudos do proprio OHIF, que nao e usada no Radix
    // (quem escolhe as imagens e o Radix); o nome RADIX IMAGO fica maior.
    '[data-cy="return-to-work-list"]>svg{display:none!important}',
    '[data-cy="return-to-work-list"]{pointer-events:none!important;cursor:default!important}',
    // CIRCULO NO CANTO SUPERIOR DIREITO DA IMAGEM (pedido de 22/11/2026):
    // o menu de janela/cores do OHIF some; o contraste continua na barra
    '[data-cy="viewport-grid"] .right-viewport-scrollbar.top-\\[4px\\]{display:none!important}',
    // cubo (girar em 3D), camera (captura) e layout: somem (22/11/2026)
    '[data-cy="TrackballRotate"],[data-cy="Capture"],[data-cy="Layout"]{display:none!important}'
  ].join('');
  function aplicar() {
    if (document.getElementById('radix-tema')) return;
    var s = document.createElement('style');
    s.id = 'radix-tema';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  aplicar();
  document.addEventListener('DOMContentLoaded', aplicar);
})();

// ---------------------------------------------------------------------
// SEM A COLUNA "STUDIES" E SEM O "LAYOUT" DO OHIF
// 22/11/2026 (video das telas): vale SEMPRE, mesmo sem parametro no
// endereco ("Abrir no visualizador" de Minhas imagens abre o OHIF direto).
// Tambem somem o cubo (TrackballRotate) e a camera (Capture). Quem escolhe
// as imagens e o layout e o Radix.
// Com radixRecolherEstudos=1 na URL (Curadoria e visualizador do Radix), a
// coluna "Studies" da esquerda do OHIF SOME por completo - nem a faixa
// estreita com a seta e a aba "Studies" fica (pedido de 20/10/2026). A
// radiografia ganha essa largura. Quem escolhe as imagens e o Radix.
// Com radixTeclaR=1 (visualizador do Radix, que tem o proprio seletor de
// layout), o botao "Layout" do OHIF tambem some - um seletor so na tela.
// So esconde (display:none): nada e apagado nem muda no OHIF fora do Radix.
// ---------------------------------------------------------------------
;(function () {
  var semEstudos = true;
  var semLayout = true;

  // a coluna da esquerda inteira: sobe do botao da seta ate o bloco que fica
  // AO LADO da area de imagens (o pai dele ja contem a area de imagens)
  function esconderEstudos() {
    var botao = document.querySelector('[data-cy="side-panel-header-left"]');
    var grade = document.querySelector('[data-cy="viewport-grid"]');
    if (!botao || !grade) return false;
    var bloco = botao;
    while (bloco.parentElement && !bloco.parentElement.contains(grade)) bloco = bloco.parentElement;
    if (!bloco.parentElement || bloco === document.body || bloco.contains(grade)) return false;
    if (bloco.style.display !== 'none') bloco.style.setProperty('display', 'none', 'important');
    return true;
  }

  // um botao da barra de ferramentas e o invólucro dele
  function esconderBotao(nome) {
    var botao = document.querySelector('[data-cy="' + nome + '"]');
    if (!botao) return false;
    var alvo = botao;
    // sobe enquanto o pai so tiver este botao dentro (tooltip, moldura...)
    for (var i = 0; i < 4 && alvo.parentElement && alvo.parentElement.children.length === 1; i++) alvo = alvo.parentElement;
    if (alvo.style.display !== 'none') alvo.style.setProperty('display', 'none', 'important');
    return true;
  }
  function esconderLayout() {
    esconderBotao('Layout');
    esconderBotao('TrackballRotate');
    esconderBotao('Capture');
  }

  // o OHIF redesenha a tela algumas vezes ao abrir: confere por ~30 s
  var tentativas = 0;
  var relogio = setInterval(function () {
    tentativas++;
    if (semEstudos) esconderEstudos();
    if (semLayout) esconderLayout();
    if (tentativas > 120) clearInterval(relogio);
  }, 250);
})();

// ---------------------------------------------------------------------
// VARIAS IMAGENS NA MESMA TELA (layout do "Visualizador de imagens
// selecionadas" do Radix)
// Quando o Radix abre o OHIF com varios estudos na URL e o parametro
// radixGrade=LINHASxCOLUNAS (ex.: radixGrade=1x3), este bloco divide a
// area de imagens do PROPRIO OHIF nessa grade e coloca um estudo em cada
// quadro, na mesma ordem da URL. Resultado: um unico visualizador, com uma
// unica barra de ferramentas, mostrando as imagens lado a lado (como nos
// PACS), em vez de varios visualizadores separados.
// Usa apenas os servicos publicos que o proprio OHIF expoe na janela
// (window.services / window.commandsManager). Sem radixGrade na URL, nada
// muda no comportamento normal do OHIF.
// Ao clicar num quadro, avisa a tela do Radix (janela "mae") qual estudo
// ficou ativo, para os dados da imagem embaixo acompanharem. A mensagem so
// e enviada para a origem do proprio Radix (da configuracao, RADIX_ORIGEM_CONFIAVEL) e
// leva apenas o identificador do estudo (anonimizado) - nenhum dado pessoal.
// ---------------------------------------------------------------------
;(function () {
  var params = new URLSearchParams(window.location.search);
  var grade = /^(\d{1,2})x(\d{1,2})$/.exec(params.get('radixGrade') || '');
  var ordem = (params.get('StudyInstanceUIDs') || '').split(',').filter(Boolean);
  if (!grade || ordem.length < 2) return;
  var linhas = Math.min(+grade[1], 4);
  var colunas = Math.min(+grade[2], 5);
  // endereco das telas do Radix, vindo da CONFIGURACAO (RADIX_ORIGEM_CONFIAVEL,
  // trocado por ohif/gerar-config.sh) - nunca de quem emoldurou o OHIF (ASVS 3.5.5)
  var origemRadix = '__RADIX_ORIGEM_CONFIAVEL__';

  function avisarAtivo(servicos) {
    if (!origemRadix || window.parent === window) return;
    try {
      var estado = servicos.viewportGridService.getState();
      var vp = estado.viewports.get(estado.activeViewportId);
      var dsUid = vp && vp.displaySetInstanceUIDs && vp.displaySetInstanceUIDs[0];
      var ds = dsUid && servicos.displaySetService.getDisplaySetByUID(dsUid);
      if (ds) window.parent.postMessage({ tipo: 'radix-estudo-ativo', estudo: ds.StudyInstanceUID }, origemRadix);
    } catch (e) { /* sem aviso: a tela do Radix continua funcionando */ }
  }

  // CORRECAO (27/10/2026 - "as imagens carregam e logo somem, tela escura"):
  // ao trocar a imagem de um quadro logo depois de dividir a tela, o OHIF
  // 3.9 as vezes fica com a "camera" do quadro anterior (imagem fora de
  // vista = quadro preto) ou mostra a imagem que estava antes no quadro
  // (visto com radiografias coloridas, sem orientacao no DICOM). Quando
  // cada quadro ja tem a sua imagem carregada, recarrega a pilha e
  // recentraliza a camera - mesma imagem, sem alterar nada no arquivo.
  function recarregarQuadros(s, pares, tentativa) {
    setTimeout(function () {
      var cs = s.cornerstoneViewportService;
      var prontos = pares.every(function (p) {
        var vp = cs && cs.getCornerstoneViewport(p.viewportId);
        return vp && vp.getImageIds && vp.getImageIds().length && vp.getImageData && vp.getImageData();
      });
      if (!prontos && tentativa < 40) { recarregarQuadros(s, pares, tentativa + 1); return; }
      pares.forEach(function (p) {
        try {
          var vp = cs.getCornerstoneViewport(p.viewportId);
          if (!vp || !vp.setStack) return;
          var ids = vp.getImageIds();
          if (!ids || !ids.length) return;
          Promise.resolve(vp.setStack(ids, vp.getCurrentImageIdIndex() || 0)).then(function () {
            vp.resetCamera();
            vp.render();
          }).catch(function () { /* quadro ficou como estava */ });
        } catch (e) { /* quadro ficou como estava */ }
      });
    }, tentativa === 0 ? 600 : 250);
  }

  function distribuir() {
    var s = window.services;
    var cmd = window.commandsManager;
    var todos = s.displaySetService.getActiveDisplaySets();
    var escolhidos = ordem.map(function (uid) {
      return todos.find(function (d) { return d.StudyInstanceUID === uid && !d.unsupported; });
    }).filter(Boolean);
    cmd.runCommand('setViewportGridLayout', { numRows: linhas, numCols: colunas });
    setTimeout(function () {
      var ids = Array.from(s.viewportGridService.getState().viewports.keys());
      var pares = ids.slice(0, escolhidos.length).map(function (id, i) {
        return { viewportId: id, displaySetInstanceUIDs: [escolhidos[i].displaySetInstanceUID] };
      });
      if (pares.length) {
        s.viewportGridService.setDisplaySetsForViewports(pares);
        recarregarQuadros(s, pares, 0);
      }
      // mais espaco para as imagens: recolhe a coluna "Studies" da esquerda
      // (so clica se a coluna estiver aberta - o mesmo botao abre e fecha)
      var recolher = document.querySelector('[data-cy="side-panel-header-left"]');
      if (recolher && document.querySelector('[data-cy="studyBrowser-panel"]')) recolher.click();
      // o reprodutor de "cine" (play/FPS) nao faz sentido para radiografias
      // de uma imagem so e cobriria parte de cada quadro
      try { if (s.cineService) s.cineService.setIsCineEnabled(false); } catch (e) { /* opcional */ }
    }, 700);
  }

  var tentativas = 0;
  var aplicado = false;
  var relogio = setInterval(function () {
    tentativas++;
    var s = window.services;
    if (!s || !window.commandsManager || !s.displaySetService) { if (tentativas > 120) clearInterval(relogio); return; }
    var carregados = s.displaySetService.getActiveDisplaySets();
    var todosChegaram = ordem.every(function (uid) {
      return carregados.some(function (d) { return d.StudyInstanceUID === uid; });
    });
    // espera todos os estudos (ou ~30 s, e usa os que chegaram)
    if (!todosChegaram && tentativas < 120) return;
    if (!carregados.length) return;
    clearInterval(relogio);
    // pequena folga para o protocolo de exibicao padrao do OHIF terminar
    // antes de reorganizar a grade (senao ele desfaz a nossa)
    setTimeout(function () {
      if (aplicado) return;
      aplicado = true;
      distribuir();
      s.viewportGridService.subscribe(s.viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, function () { avisarAtivo(s); });
    }, 800);
  }, 250);
})();

// ---------------------------------------------------------------------
// MARCACOES DO CURADOR DESENHADAS DENTRO DO PROPRIO OHIF
// A tela do Radix manda (postMessage) as marcacoes de cada estudo e quais
// devem aparecer. Este bloco desenha as formas (oval, retangulo, seta) por
// cima da imagem, DENTRO do visualizador: a imagem continua exatamente a
// mesma (mesmo tamanho, brilho, zoom) - a unica diferenca sao as formas, que
// acompanham o zoom e o arraste que a pessoa fizer no OHIF.
// As coordenadas das marcacoes sao relativas (0 a 1) a largura/altura da
// imagem; aqui elas sao convertidas para a posicao na tela usando as
// funcoes do proprio motor de imagens do OHIF (cornerstone).
// So aceita mensagens da origem do Radix (da configuracao, RADIX_ORIGEM_CONFIAVEL).
// ---------------------------------------------------------------------
// Estilo (igual as telas do Radix e aos arquivos baixados/impressos):
//  - cor por tipo de achado (paleta Okabe & Ito, para daltonicos);
//  - contorno com "halo" (borda escura fina), sem veu branco por cima;
//  - numero FORA da forma, ligado a ela por uma linha-guia.
// Interacao ("foco + contexto"):
//  - mouse sobre a forma ou o numero: ela fica mais forte, vai para a
//    frente e as outras ficam esmaecidas; abre a descricao dela;
//  - clique: isola a marcacao (so ela aparece); clique de novo ou Esc: todas;
//  - a tela do Radix tambem pode destacar (mouse na linha "Marcação N" da
//    descricao), isolar e ligar o "holofote" (escurece o resto da imagem).
;(function () {
  if (window.parent === window) return;
  // endereco das telas do Radix, vindo da CONFIGURACAO (RADIX_ORIGEM_CONFIAVEL,
  // trocado por ohif/gerar-config.sh) - nunca de quem emoldurou o OHIF (ASVS 3.5.5)
  var origemRadix = '__RADIX_ORIGEM_CONFIAVEL__';
  if (!origemRadix) return;

  var NS = 'http://www.w3.org/2000/svg';
  // mesma tabela de frontend/src/lib/marcacoes.ts (CORES_ACHADO)
  var CORES = {
    carie: '#E69F00', lesao_periapical: '#CC79A7', perda_ossea: '#56B4E9', dente_incluso: '#009E73',
    tratamento_endodontico: '#F0E442', erro_tecnico: '#D55E00', normal: '#FFFFFF', outro: '#C3CEDD'
  };
  var HALO = 'rgba(0,0,0,0.6)';
  var estado = { estudos: {}, visiveis: {}, foco: null, holofote: false, isoladas: {} };
  var rodando = false;

  window.addEventListener('message', function (ev) {
    if (ev.origin !== origemRadix) return;
    var d = ev.data;
    if (!d) return;
    if (d.tipo === 'radix-marcacoes') {
      estado.estudos = d.estudos || {};
      estado.visiveis = {};
      (d.visiveis || []).forEach(function (uid) { estado.visiveis[uid] = true; });
      estado.foco = d.foco && typeof d.foco.uid === 'string' ? d.foco : null;
      estado.holofote = !!d.holofote;
      iniciar();
    } else if (d.tipo === 'radix-isolar' && typeof d.uid === 'string' && typeof d.indice === 'number') {
      estado.isoladas[d.uid] = estado.isoladas[d.uid] === d.indice ? null : d.indice;
      iniciar();
    }
    // botoes do Radix ("R" gira, "I" inverte): os mesmos comandos dos atalhos
    // de teclado do proprio OHIF, so na imagem ativa e so na tela (nao grava)
    // (rotateViewportCCW: o Radix desfaz o giro quando a gravacao falha)
    if (d.tipo === 'radix-comando' && (d.comando === 'rotateViewportCW' || d.comando === 'rotateViewportCCW' || d.comando === 'invertViewport')) {
      try {
        if (typeof d.uid === 'string') ativarEstudo(d.uid);
        window.commandsManager.runCommand(d.comando);
      } catch (e) { /* OHIF ainda carregando */ }
    }
    if (typeof d.espacoDireita === 'number' && isFinite(d.espacoDireita)) {
      estado.espacoDireita = Math.max(0, Math.min(d.espacoDireita, window.innerWidth));
      aplicarEspaco(0);
    }
  });

  // deixa ativo o quadro que mostra o estudo pedido (para o "R" de uma
  // imagem girar ESSA imagem quando ha varias lado a lado)
  function ativarEstudo(uid) {
    var sv = window.services;
    var st = sv.viewportGridService.getState();
    st.viewports.forEach(function (vp, id) {
      var dsUid = vp && vp.displaySetInstanceUIDs && vp.displaySetInstanceUIDs[0];
      var ds = dsUid && sv.displaySetService.getDisplaySetByUID(dsUid);
      if (ds && ds.StudyInstanceUID === uid) sv.viewportGridService.setActiveViewportId(id);
    });
  }

  // TECLA "R" (com radixTeclaR=1 na URL - visualizador da Pesquisa): em vez
  // do giro so na tela do proprio OHIF, avisa o Radix, que decide (a
  // curadoria grava o giro na imagem; os demais giram so na tela).
  if (new URLSearchParams(window.location.search).get('radixTeclaR') === '1') {
    window.addEventListener('keydown', function (ev) {
      if ((ev.key !== 'r' && ev.key !== 'R') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var alvo = ev.target;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      // Shift+R = girar para a esquerda (anti-horario)
      try { window.parent.postMessage({ tipo: 'radix-tecla-girar', sentido: ev.shiftKey ? 'anti' : 'horario' }, origemRadix); } catch (e) { /* ignora */ }
    }, true);
  }

  // QUADROS DAS IMAGENS: avisa o Radix onde fica cada quadro de imagem (com
  // a moldura), para o quadro de informacoes do Radix ficar exatamente
  // alinhado com eles (mesma linha de cima e de baixo).
  var ultimosQuadros = '';
  setInterval(function () {
    var grade = document.querySelector('[data-cy="viewport-grid"]');
    if (!grade) return;
    var quadros = [];
    Array.prototype.forEach.call(grade.children, function (f) {
      var r = f.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) {
        quadros.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    var texto = JSON.stringify(quadros);
    if (texto === ultimosQuadros) return;
    ultimosQuadros = texto;
    try { window.parent.postMessage({ tipo: 'radix-quadros', quadros: quadros }, origemRadix); } catch (e) { /* ignora */ }
  }, 400);

  // ESPACO A DIREITA (pedido de 20/10/2026): quando o Radix mostra o quadro
  // de informacoes da imagem na metade direita, o OHIF continua com a largura
  // TODA (a barra de ferramentas inteira, de ponta a ponta), e so a area das
  // imagens encolhe para nao ficar escondida atras do quadro. O Radix manda
  // quantos pixels, a partir da borda direita, o quadro ocupa.
  function aplicarEspaco(tentativa) {
    var grade = document.querySelector('[data-cy="viewport-grid"]');
    if (!grade || !grade.parentElement) {
      if (tentativa < 40) setTimeout(function () { aplicarEspaco(tentativa + 1); }, 250);
      return;
    }
    var pai = grade.parentElement;
    var px = estado.espacoDireita || 0;
    var chave = px + 'x' + window.innerWidth;
    if (pai.__radixEspaco === chave) return;
    pai.__radixEspaco = chave;
    pai.style.boxSizing = 'border-box';
    pai.style.paddingRight = '0px';
    if (!px) return;
    var sobra = grade.getBoundingClientRect().right - (window.innerWidth - px);
    pai.style.paddingRight = Math.max(0, Math.round(sobra)) + 'px';
  }
  window.addEventListener('resize', function () { if (estado.espacoDireita) aplicarEspaco(0); });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') estado.isoladas = {};
  }, true);

  // avisa a tela do Radix que esta pronto para receber as marcacoes
  var avisos = 0;
  var avisar = setInterval(function () {
    avisos++;
    if (window.services) {
      try { window.parent.postMessage({ tipo: 'radix-ohif-pronto' }, origemRadix); } catch (e) { /* ignora */ }
    }
    if (avisos > 40) clearInterval(avisar);
  }, 500);

  function el(nome, attrs, pai) {
    var n = document.createElementNS(NS, nome);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(n);
    return n;
  }
  // marcacao SUGERIDA pelo revisor da segunda opiniao (pedido do video,
  // 22/11/2026): sempre rosa e tracejada, para nao confundir com as do curador
  var COR_SUGERIDA = '#F472B6';
  function cor(m) {
    if (m && m.sugerida) return COR_SUGERIDA;
    return (m && m.achado && CORES[m.achado]) || '#FFFFFF';
  }

  // ---------- caixinha com a descricao (fora do SVG, que e redesenhado) ----------
  var dica = null;
  function mostrarDica(texto, x, y) {
    if (!dica) {
      dica = document.createElement('div');
      dica.className = 'radix-dica-marcacao';
      dica.setAttribute('role', 'tooltip');
      dica.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;max-width:280px;padding:6px 10px;border-radius:8px;background:rgba(15,23,42,0.95);color:#f8fafc;font:600 13px/1.35 Inter,Arial,sans-serif;border:1px solid #fbbf24;box-shadow:0 6px 18px rgba(0,0,0,0.45);white-space:normal';
      document.body.appendChild(dica);
    }
    dica.textContent = texto;
    dica.style.display = 'block';
    var larg = dica.offsetWidth, alt = dica.offsetHeight;
    var px = x + 14, py = y + 14;
    if (px + larg > window.innerWidth - 4) px = x - larg - 14;
    if (py + alt > window.innerHeight - 4) py = y - alt - 14;
    dica.style.left = Math.max(4, px) + 'px';
    dica.style.top = Math.max(4, py) + 'px';
  }
  function esconderDica() { if (dica) dica.style.display = 'none'; }

  // ---------- geometria (mesma conta de geometriaMarcacao em lib/marcacoes.ts) ----------
  function geometria(m, tela) {
    if (m.tipo === 'seta') {
      var a = tela(m.x1 || 0, m.y1 || 0), b = tela(m.x2 || 0, m.y2 || 0);
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), tam = 13, ab = 28 * Math.PI / 180;
      var p1 = [b[0] - tam * Math.cos(ang - ab), b[1] - tam * Math.sin(ang - ab)];
      var p2 = [b[0] - tam * Math.cos(ang + ab), b[1] - tam * Math.sin(ang + ab)];
      var dx = a[0] - b[0], dy = a[1] - b[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= len; dy /= len;
      return {
        seta: { a: a, b: b }, pontos: [a, b],
        caminho: 'M' + a[0] + ',' + a[1] + ' L' + b[0] + ',' + b[1],
        ponta: 'M' + p1[0] + ',' + p1[1] + ' L' + b[0] + ',' + b[1] + ' L' + p2[0] + ',' + p2[1],
        ancora: a, selo: [a[0] + dx * 18, a[1] + dy * 18], area: len * 10
      };
    }
    var x = m.x || 0, y = m.y || 0, w = m.largura || 0, h = m.altura || 0, pts = [], k;
    // INCLINACAO (27/10/2026): `angulo` (graus, horario) gira a forma em volta
    // do centro, em PIXELS da imagem - a proporcao da imagem vem da propria
    // conversao para a tela (o giro/espelho do OHIF continua valendo)
    var angulo = +m.angulo || 0, cxr = x + w / 2, cyr = y + h / 2, prop = 1;
    if (angulo) {
      var o0 = tela(0, 0), o1 = tela(1, 0), o2 = tela(0, 1);
      var lw = Math.sqrt((o1[0] - o0[0]) * (o1[0] - o0[0]) + (o1[1] - o0[1]) * (o1[1] - o0[1]));
      var lh = Math.sqrt((o2[0] - o0[0]) * (o2[0] - o0[0]) + (o2[1] - o0[1]) * (o2[1] - o0[1]));
      prop = lh ? lw / lh : 1;
    }
    var rad = angulo * Math.PI / 180, ca = Math.cos(rad), sa = Math.sin(rad);
    function ponto(rx, ry) {
      if (!angulo) return tela(rx, ry);
      var dx = (rx - cxr) * prop, dy = ry - cyr;
      return tela(cxr + (dx * ca - dy * sa) / prop, cyr + dx * sa + dy * ca);
    }
    if (m.tipo === 'oval') {
      for (k = 0; k < 72; k++) {
        var t = (k / 72) * Math.PI * 2;
        pts.push(ponto(x + w / 2 + (w / 2) * Math.cos(t), y + h / 2 + (h / 2) * Math.sin(t)));
      }
    } else {
      pts = [ponto(x, y), ponto(x + w, y), ponto(x + w, y + h), ponto(x, y + h)];
    }
    var ancora;
    if (m.tipo === 'oval') {
      var rx = w / 2, ry = h / 2;
      ancora = ponto(x + rx - rx * Math.SQRT1_2, y + ry - ry * Math.SQRT1_2);
    } else ancora = ponto(x, y);
    var centro = tela(x + w / 2, y + h / 2);
    var ddx = ancora[0] - centro[0], ddy = ancora[1] - centro[1], l = Math.sqrt(ddx * ddx + ddy * ddy);
    if (l < 0.5) { ddx = -Math.SQRT1_2; ddy = -Math.SQRT1_2; } else { ddx /= l; ddy /= l; }
    var area = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    return {
      pontos: pts,
      caminho: 'M' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' L') + ' Z',
      ancora: ancora, selo: [ancora[0] + ddx * 24, ancora[1] + ddy * 24], area: Math.abs(area / 2)
    };
  }
  function dentroPoligono(px, py, pts) {
    var dentro = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) dentro = !dentro;
    }
    return dentro;
  }
  function distSegmento(px, py, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
    var cx = a[0] + t * dx, cy = a[1] + t * dy;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
  }
  // numero primeiro; depois a seta; depois a MENOR forma que contem o ponto
  function marcacaoSob(geos, px, py) {
    var i, g, achado = null, menor = Infinity;
    for (i = geos.length - 1; i >= 0; i--) {
      g = geos[i];
      if (g && Math.sqrt((px - g.selo[0]) * (px - g.selo[0]) + (py - g.selo[1]) * (py - g.selo[1])) <= 13) return i;
    }
    for (i = 0; i < geos.length; i++) {
      g = geos[i];
      if (g && g.seta && distSegmento(px, py, g.seta.a, g.seta.b) <= 7) return i;
    }
    for (i = 0; i < geos.length; i++) {
      g = geos[i];
      if (g && !g.seta && g.area < menor && dentroPoligono(px, py, g.pontos)) { achado = i; menor = g.area; }
    }
    return achado;
  }
  function caminhoHolofote(g, w, h) {
    var fora = 'M0,0 H' + w + ' V' + h + ' H0 Z';
    if (!g.seta) return fora + ' ' + g.caminho;
    // seta (27/10/2026): ilumina um circulo em volta da PONTA, onde fica a alteracao
    var a = g.seta.a, b = g.seta.b, cx = b[0], cy = b[1];
    var r = Math.max(28, Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) * 0.5), pts = [];
    for (var k = 0; k < 48; k++) { var t = (k / 48) * Math.PI * 2; pts.push((cx + r * Math.cos(t)) + ',' + (cy + r * Math.sin(t))); }
    return fora + ' M' + pts.join(' L') + ' Z';
  }

  // ---------- mouse: descricao, destaque e clique para isolar ----------
  function ouvirMouse(alvo) {
    if (alvo.__radixOuvindo) return;
    alvo.__radixOuvindo = true;
    var inicio = null;
    function sob(ev) {
      var geos = alvo.__radixGeos || [];
      if (!geos.length) return null;
      var r = alvo.getBoundingClientRect();
      return marcacaoSob(geos, ev.clientX - r.left, ev.clientY - r.top);
    }
    alvo.addEventListener('mousemove', function (ev) {
      var i = sob(ev);
      alvo.__radixFoco = i;
      if (i !== null && alvo.__radixLista && alvo.__radixLista[i]) {
        var m = alvo.__radixLista[i];
        mostrarDica(m.texto || ('Marcação ' + (i + 1)), ev.clientX, ev.clientY);
      } else esconderDica();
    });
    alvo.addEventListener('mouseleave', function () { alvo.__radixFoco = null; esconderDica(); });
    alvo.addEventListener('mousedown', function (ev) { inicio = [ev.clientX, ev.clientY]; }, true);
    alvo.addEventListener('mouseup', function (ev) {
      if (!inicio || ev.button !== 0) return;
      var moveu = Math.abs(ev.clientX - inicio[0]) + Math.abs(ev.clientY - inicio[1]);
      inicio = null;
      if (moveu > 4) return; // foi um arraste (brilho/contraste, mover): nao isola
      var i = sob(ev), uid = alvo.__radixUid;
      if (i === null || !uid) return;
      estado.isoladas[uid] = estado.isoladas[uid] === i ? null : i;
    }, true);
  }

  // ---------- desenho ----------
  function algumVisivel() {
    if (estado.foco) return true;
    for (var k in estado.visiveis) if (estado.visiveis[k]) return true;
    return false;
  }
  function iniciar() {
    if (rodando) return;
    rodando = true;
    requestAnimationFrame(quadro);
  }
  function quadro() {
    try { desenhar(); } catch (e) { /* proximo quadro tenta de novo */ }
    if (algumVisivel()) { requestAnimationFrame(quadro); } else { limparTudo(); rodando = false; }
  }
  function limparTudo() {
    var lista = document.querySelectorAll('svg.radix-marcas');
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].parentNode) { lista[i].parentNode.__radixGeos = []; lista[i].parentNode.__radixFoco = null; }
      lista[i].remove();
    }
    esconderDica();
  }

  function desenharMarcacao(svg, g, m, n, forte, apagada) {
    var c = cor(m);
    var grupo = el('g', { opacity: apagada ? '0.25' : '1' }, svg);
    var larguraHalo = forte ? '3.5' : '2.5', larguraTraco = forte ? '1.75' : '1.25'; // tracos finos: nao cobrem estruturas
    el('path', { d: g.caminho, fill: 'none', stroke: HALO, 'stroke-width': larguraHalo, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, grupo);
    if (g.seta) el('path', { d: g.ponta, fill: 'none', stroke: HALO, 'stroke-width': larguraHalo, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, grupo);
    var traco = { d: g.caminho, stroke: c, 'stroke-width': larguraTraco, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', fill: 'none' };
    if (!g.seta) { traco.fill = c; traco['fill-opacity'] = '0.06'; }
    if (m && m.sugerida) traco['stroke-dasharray'] = '6 4';
    el('path', traco, grupo);
    if (g.seta) el('path', { d: g.ponta, fill: 'none', stroke: c, 'stroke-width': larguraTraco, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, grupo);
    el('line', { x1: g.ancora[0], y1: g.ancora[1], x2: g.selo[0], y2: g.selo[1], stroke: HALO, 'stroke-width': '1.75', 'stroke-linecap': 'round' }, grupo);
    el('line', { x1: g.ancora[0], y1: g.ancora[1], x2: g.selo[0], y2: g.selo[1], stroke: c, 'stroke-width': '0.75', 'stroke-linecap': 'round' }, grupo);
    el('circle', { cx: g.selo[0], cy: g.selo[1], r: forte ? '12' : '11', fill: c, stroke: '#0b1220', 'stroke-width': '2' }, grupo);
    var tx = el('text', { x: g.selo[0], y: g.selo[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': '12', 'font-weight': '800', 'font-family': 'Inter, Arial, sans-serif', fill: '#000000' }, grupo);
    tx.textContent = String(n);
  }

  function desenhar() {
    var s = window.services;
    if (!s || !s.viewportGridService || !s.cornerstoneViewportService) return;
    var grade = s.viewportGridService.getState();
    grade.viewports.forEach(function (vp, id) {
      var cvp = null;
      try { cvp = s.cornerstoneViewportService.getCornerstoneViewport(id); } catch (e) { cvp = null; }
      if (!cvp || !cvp.element) return;
      var alvo = cvp.element;
      var svg = alvo.querySelector('svg.radix-marcas');
      var dsUid = vp.displaySetInstanceUIDs && vp.displaySetInstanceUIDs[0];
      var ds = dsUid && s.displaySetService.getDisplaySetByUID(dsUid);
      var uid = ds && ds.StudyInstanceUID;
      var todas = (uid && estado.estudos[uid]) || [];
      var focoExterno = estado.foco && estado.foco.uid === uid ? estado.foco.indice : null;
      // marcacoes desligadas, mas com o mouse na linha da descricao: mostra so aquela
      var mostrar = uid && estado.visiveis[uid] ? 'todas' : (focoExterno !== null ? 'foco' : '');
      if (!todas.length || !mostrar) {
        if (svg) svg.remove();
        alvo.__radixGeos = []; alvo.__radixFoco = null;
        return;
      }

      var dados = cvp.getImageData && cvp.getImageData();
      if (!dados || !dados.imageData || !dados.dimensions) return;
      var cols = dados.dimensions[0], linhas = dados.dimensions[1];
      function tela(rx, ry) {
        var mundo = dados.imageData.indexToWorld([rx * cols - 0.5, ry * linhas - 0.5, 0]);
        return cvp.worldToCanvas(mundo);
      }

      if (!svg) {
        svg = el('svg', { class: 'radix-marcas' });
        svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible';
        if (getComputedStyle(alvo).position === 'static') alvo.style.position = 'relative';
        alvo.appendChild(svg);
      }
      ouvirMouse(alvo);
      alvo.__radixUid = uid;
      alvo.__radixLista = todas;
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var isolada = estado.isoladas[uid];
      if (isolada === undefined || isolada >= todas.length) isolada = null;
      var geos = todas.map(function (m, i) {
        // a linha da descricao sob o mouse sempre aparece, mesmo isolada outra
        if (i !== focoExterno) {
          if (mostrar === 'foco') return null;
          if (isolada !== null && i !== isolada) return null;
        }
        return geometria(m, tela);
      });
      alvo.__radixGeos = geos;

      var local = alvo.__radixFoco;
      if (local !== null && local !== undefined && !geos[local]) local = null;
      var ativo = local !== null && local !== undefined ? local : (focoExterno !== null && geos[focoExterno] ? focoExterno : isolada);

      if (estado.holofote && ativo !== null && geos[ativo]) {
        var r = alvo.getBoundingClientRect();
        el('path', { d: caminhoHolofote(geos[ativo], r.width, r.height), fill: 'rgba(0,0,0,0.55)', 'fill-rule': 'evenodd' }, svg);
      }
      var ordem = [];
      geos.forEach(function (g, i) { if (g && i !== ativo) ordem.push(i); });
      if (ativo !== null && geos[ativo]) ordem.push(ativo);
      ordem.forEach(function (i) {
        desenharMarcacao(svg, geos[i], todas[i], i + 1, i === ativo, ativo !== null && i !== ativo);
      });
    });
  }
})();

// ---------------------------------------------------------------------
// MOUSE PRATICO (pedido do Luciano, 23/11/2026): zoom e deslocamento sem ir
// aos icones da barra do OHIF, em todos os visualizadores do Radix.
//  - arrastar com o botao ESQUERDO = mover a imagem (Pan);
//  - arrastar com o DIREITO = brilho/contraste (WindowLevel);
//  - arrastar com o do MEIO = zoom;
//  - RODA = zoom no ponto do cursor (a imagem cresce "em volta" do que se
//    aponta). Tomografia (varios cortes): a roda continua passando os
//    cortes; o zoom fica no Ctrl + roda;
//  - DUPLO CLIQUE = a imagem volta a caber no quadro.
// As ligacoes sao aplicadas UMA vez por grupo de ferramentas: se a pessoa
// escolher outra ferramenta na barra (regua, por exemplo), ela vale.
// ---------------------------------------------------------------------
;(function () {
  var ZOOM_MIN = 0.1;
  var ZOOM_MAX = 40;
  var PASSO = 1.15;
  var configurados = {};

  function configurarGrupos() {
    var s = window.services;
    if (!s || !s.toolGroupService) return;
    var ids = [];
    try { ids = s.toolGroupService.getToolGroupIds() || []; } catch (e) { return; }
    ids.forEach(function (id) {
      if (configurados[id]) return;
      // o quadro 3D da tomografia (grupo "volume3d") fica com o do OHIF:
      // botao esquerdo GIRA o volume (23/11/2026)
      if (id === 'volume3d') return;
      var g = s.toolGroupService.getToolGroup(id);
      if (!g || !g.hasTool || !g.hasTool('Pan') || !g.hasTool('WindowLevel')) return;
      configurados[id] = true;
      try {
        ['Pan', 'WindowLevel', 'Zoom'].forEach(function (n) {
          if (g.hasTool(n)) g.setToolPassive(n, { removeAllBindings: true });
        });
        g.setToolActive('Pan', { bindings: [{ mouseButton: 1 }] });
        g.setToolActive('WindowLevel', { bindings: [{ mouseButton: 2 }] });
        if (g.hasTool('Zoom')) g.setToolActive('Zoom', { bindings: [{ mouseButton: 4 }] });
      } catch (e) { /* fica com as ligacoes do OHIF */ }
    });
  }
  setInterval(configurarGrupos, 1000);

  // os ouvintes da roda e do duplo clique entram uma vez so por pagina
  if (window.__radixMouseOuvindo) return;
  window.__radixMouseOuvindo = true;

  function viewportSob(alvo) {
    var s = window.services;
    var quadro = alvo && alvo.closest ? alvo.closest('[data-viewport-uid]') : null;
    if (!quadro || !s || !s.cornerstoneViewportService) return null;
    var vp = null;
    try { vp = s.cornerstoneViewportService.getCornerstoneViewport(quadro.getAttribute('data-viewport-uid')); } catch (e) { vp = null; }
    return vp ? { vp: vp, quadro: quadro } : null;
  }

  window.addEventListener('wheel', function (ev) {
    var achado = viewportSob(ev.target);
    if (!achado) return;
    var vp = achado.vp;
    var cortes = 1;
    try { cortes = (vp.getImageIds && vp.getImageIds().length) || 1; } catch (e) { cortes = 1; }
    if (cortes > 1 && !ev.ctrlKey) return; // tomografia: a roda passa os cortes
    ev.preventDefault();
    ev.stopPropagation();
    try {
      var r = achado.quadro.getBoundingClientRect();
      var ponto = [ev.clientX - r.left, ev.clientY - r.top];
      var antes = vp.canvasToWorld(ponto);
      var atual = vp.getZoom();
      var novo = ev.deltaY < 0 ? atual * PASSO : atual / PASSO;
      novo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, novo));
      if (novo === atual) return;
      vp.setZoom(novo);
      // o ponto sob o cursor volta para baixo do cursor
      var depois = vp.canvasToWorld(ponto);
      var cam = vp.getCamera();
      var d = [antes[0] - depois[0], antes[1] - depois[1], antes[2] - depois[2]];
      vp.setCamera({
        focalPoint: [cam.focalPoint[0] + d[0], cam.focalPoint[1] + d[1], cam.focalPoint[2] + d[2]],
        position: [cam.position[0] + d[0], cam.position[1] + d[1], cam.position[2] + d[2]],
      });
      vp.render();
    } catch (e) { /* sem zoom nesta imagem */ }
  }, { capture: true, passive: false });

  window.addEventListener('dblclick', function (ev) {
    var achado = viewportSob(ev.target);
    if (!achado) return;
    try {
      achado.vp.resetCamera();
      achado.vp.render();
    } catch (e) { /* ignora */ }
  }, true);
})();

// ---------------------------------------------------------------------
// TAMANHO REAL (pedido do Luciano, 23/11/2026), em todos os visualizadores:
// tres botoes no canto de cima da area das imagens, valendo para a imagem
// ativa.
//  - "1:1": um pixel da imagem = um pixel da tela (qualquer imagem);
//  - "Tamanho real": milimetros de verdade na tela. Precisa (a) da medida
//    do pixel no DICOM (PixelSpacing; na falta, ImagerPixelSpacing - a
//    medida no detector: em panoramica ha a ampliacao propria do exame) e
//    (b) da CALIBRACAO da tela, feita uma vez neste navegador: a pessoa
//    ajusta uma barra ate ela ficar do tamanho de um cartao de credito
//    (85,6 mm, padrao ISO/IEC 7810). O navegador nao sabe o tamanho fisico
//    da tela; sem calibrar, nao ha milimetro de verdade;
//  - "Calibrar tela": refaz a calibracao (ex.: outro monitor ou zoom do
//    navegador).
// cornerstone3D: a altura visivel do quadro, em unidades do "mundo", e
// 2 x parallelScale; o "mundo" usa a medida que o OHIF leu da imagem.
// ---------------------------------------------------------------------
;(function () {
  var CHAVE = 'radix-px-por-mm';
  var CARTAO_MM = 85.6;
  var caixa = null;

  function lerCalibracao() {
    try {
      var v = Number(window.localStorage.getItem(CHAVE));
      return v > 0 ? v : 0;
    } catch (e) { return 0; }
  }

  function ativo() {
    var s = window.services;
    if (!s || !s.viewportGridService || !s.cornerstoneViewportService) return null;
    try {
      var st = s.viewportGridService.getState();
      var id = st.activeViewportId;
      var info = st.viewports.get(id);
      var dsUid = info && info.displaySetInstanceUIDs && info.displaySetInstanceUIDs[0];
      var ds = dsUid && s.displaySetService.getDisplaySetByUID(dsUid);
      var inst = ds && ds.instances && ds.instances[0];
      var medida = inst && (inst.PixelSpacing || inst.ImagerPixelSpacing);
      var mm = medida && Number(medida[0]) > 0 ? Number(medida[0]) : 0;
      var vp = s.cornerstoneViewportService.getCornerstoneViewport(id);
      var quadro = document.querySelector('[data-viewport-uid="' + id + '"]');
      if (!vp || !quadro) return null;
      return { vp: vp, quadro: quadro, mmPorPixel: mm };
    } catch (e) { return null; }
  }

  function mundoPorPixel(vp) {
    try {
      var d = vp.getImageData();
      var e = d && d.spacing && Number(d.spacing[1]);
      return e > 0 ? e : 1;
    } catch (e) { return 1; }
  }

  function aplicarEscala(a, mundoPorPixelDeTela) {
    var altura = a.quadro.getBoundingClientRect().height;
    if (!altura) return;
    var cam = a.vp.getCamera();
    a.vp.setCamera({ parallelScale: (altura * mundoPorPixelDeTela) / 2, focalPoint: cam.focalPoint, position: cam.position });
    a.vp.render();
  }

  function umPraUm() {
    var a = ativo();
    if (a) aplicarEscala(a, mundoPorPixel(a.vp));
  }

  function tamanhoReal() {
    var a = ativo();
    if (!a || !a.mmPorPixel) return;
    var pxPorMm = lerCalibracao();
    if (!pxPorMm) { calibrar(tamanhoReal); return; }
    // 1 px de tela = 1/pxPorMm mm; 1 unidade do mundo = mmPorPixel/mundoPorPixel mm
    aplicarEscala(a, (1 / pxPorMm) * (mundoPorPixel(a.vp) / a.mmPorPixel));
  }

  function botao(texto, aoClicar) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.style.cssText = 'background:#0f172a;color:#e2e8f0;border:1px solid #2dd4bf66;border-radius:6px;padding:3px 8px;font:500 12px Inter,system-ui,sans-serif;cursor:pointer';
    b.addEventListener('click', aoClicar);
    return b;
  }

  function calibrar(depois) {
    if (document.getElementById('radix-calibrar')) return;
    var fundo = document.createElement('div');
    fundo.id = 'radix-calibrar';
    fundo.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center';
    var janela = document.createElement('div');
    janela.setAttribute('role', 'dialog');
    janela.setAttribute('aria-modal', 'true');
    janela.setAttribute('aria-labelledby', 'radix-calibrar-titulo');
    janela.style.cssText = 'background:#0f172a;color:#e2e8f0;border:1px solid #2dd4bf;border-radius:12px;padding:18px;max-width:760px;font:14px Inter,system-ui,sans-serif';
    var titulo = document.createElement('h2');
    titulo.id = 'radix-calibrar-titulo';
    titulo.textContent = 'Calibrar a tela';
    titulo.style.cssText = 'margin:0 0 6px;font-size:16px';
    var texto = document.createElement('p');
    texto.textContent = 'Jeito mais rápido: escolha o tamanho da sua tela em polegadas (vem na etiqueta ou no manual do monitor/notebook). Para mais precisão, encoste um cartão de crédito (ou de banco) na tela e ajuste a barra até ela ficar exatamente da largura do cartão (85,6 mm). Vale para este navegador e esta tela; refaça se mudar de monitor ou o zoom do navegador.';
    texto.style.cssText = 'margin:0 0 12px;color:#cbd5e1;font-size:13px';
    var barra = document.createElement('div');
    var atual = lerCalibracao() ? Math.round(lerCalibracao() * CARTAO_MM) : 324;
    barra.style.cssText = 'height:54px;border-radius:6px;background:linear-gradient(90deg,#2dd4bf,#3b82f6);margin:6px 0 10px;width:' + atual + 'px';
    var faixa = document.createElement('input');
    faixa.type = 'range';
    faixa.min = '150';
    faixa.max = '700';
    faixa.value = String(atual);
    faixa.setAttribute('aria-label', 'Largura da barra');
    faixa.style.cssText = 'width:100%';
    // calibracao pelas POLEGADAS do monitor (23/11/2026): diagonal da tela em
    // pixels (resolucao) / diagonal em mm. Nao depende de cartao nem regua.
    var escolhido = 0;
    var rotuloPol = document.createElement('label');
    rotuloPol.textContent = 'Tamanho da tela (polegadas) ';
    rotuloPol.style.cssText = 'display:block;margin:0 0 8px;font-size:13px';
    var polegadas = document.createElement('select');
    polegadas.setAttribute('aria-label', 'Tamanho da tela (polegadas)');
    polegadas.style.cssText = 'margin-left:6px;background:#020617;color:#e2e8f0;border:1px solid #2dd4bf66;border-radius:6px;padding:2px 6px';
    ['', '13.3', '14', '15.6', '17.3', '19', '21.5', '23.8', '24', '27', '31.5', '32', '34'].forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = v ? v.replace('.', ',') + '"' : 'escolher…';
      polegadas.appendChild(o);
    });
    polegadas.addEventListener('change', function () {
      var pol = Number(polegadas.value);
      var diagonal = Math.sqrt(Math.pow(window.screen.width || 0, 2) + Math.pow(window.screen.height || 0, 2));
      if (!pol || !diagonal) return;
      escolhido = diagonal / (pol * 25.4);
      var largura = Math.round(escolhido * CARTAO_MM);
      faixa.value = String(largura);
      barra.style.width = largura + 'px';
    });
    rotuloPol.appendChild(polegadas);
    faixa.addEventListener('input', function () { escolhido = 0; barra.style.width = faixa.value + 'px'; });
    var acoes = document.createElement('div');
    acoes.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px';
    function fechar() { if (fundo.parentNode) fundo.parentNode.removeChild(fundo); }
    acoes.appendChild(botao('Cancelar', fechar));
    acoes.appendChild(botao('Salvar', function () {
      var valor = escolhido || Number(faixa.value) / CARTAO_MM;
      try { window.localStorage.setItem(CHAVE, String(valor)); } catch (e) { /* sem salvar */ }
      fechar();
      if (depois) depois();
    }));
    janela.appendChild(titulo);
    janela.appendChild(texto);
    janela.appendChild(rotuloPol);
    janela.appendChild(barra);
    janela.appendChild(faixa);
    janela.appendChild(acoes);
    fundo.appendChild(janela);
    document.body.appendChild(fundo);
  }

  var real = null;
  function montarCaixa() {
    var grade = document.querySelector('[data-cy="viewport-grid"]');
    if (!grade || !grade.parentElement) return;
    if (!caixa || !caixa.isConnected) {
      caixa = document.createElement('div');
      caixa.setAttribute('role', 'group');
      caixa.setAttribute('aria-label', 'Tamanho da imagem');
      caixa.style.cssText = 'position:absolute;top:6px;right:10px;z-index:20;display:flex;gap:6px';
      caixa.appendChild(botao('1:1', umPraUm));
      real = botao('Tamanho real', tamanhoReal);
      caixa.appendChild(real);
      caixa.appendChild(botao('Calibrar tela', function () { calibrar(null); }));
      var pai = grade.parentElement;
      if (getComputedStyle(pai).position === 'static') pai.style.position = 'relative';
      pai.appendChild(caixa);
    }
    var a = ativo();
    var semMedida = !a || !a.mmPorPixel;
    real.disabled = semMedida;
    real.style.opacity = semMedida ? '0.45' : '1';
    real.title = semMedida
      ? 'Esta imagem não tem a medida do pixel (ex.: foto convertida): só o 1:1 funciona.'
      : 'Mostra a imagem em milímetros reais (precisa calibrar a tela uma vez).';
  }
  setInterval(montarCaixa, 700);
})();

// ---------------------------------------------------------------------
// VISUALIZADOR DA TOMOGRAFIA (pedido do Luciano, 23/11/2026; revisto no
// mesmo dia depois de testar no PC). Painel proprio, "Tomografia", que so
// aparece quando a serie aberta e uma TOMOGRAFIA (modalidade CT com varios
// cortes), com os controles EM COLUNA, A DIREITA da imagem:
//  - Planos: Axial, Sagital, Coronal e 3D, marcados/desmarcados com um
//    clique; a tela mostra SO os planos marcados (1 = um quadro, 2 = lado a
//    lado, 3 = tres lado a lado, 4 = 2 x 2). O ultimo plano marcado nao
//    desmarca. Abre com os 4. Para isso o Radix registra no OHIF um
//    protocolo por combinacao ("radix-planos-<a s c 3>"), com quadros de
//    volume (reconstrucao multiplanar) e o 3D;
//  - Janela: Osso 2000/500, Partes moles 400/40, Dentes 3000/1000 (em HU) e
//    Original. A TCFC nem sempre vem em unidades Hounsfield: quando o exame
//    nao esta em HU (ex.: 0 a 4095), o Radix acha o AR (o valor mais baixo)
//    e o PICO DAS PARTES MOLES no proprio exame e converte as janelas para a
//    escala dele (ar = -1000 HU, pico = 40 HU);
//  - 3D e SO OSSO: o quadro 3D abre com a predefinicao CT-Bone do
//    cornerstone3D, convertida para a escala do exame do mesmo jeito;
//  - Espessura nos planos: 0,625 mm (corte fino), 2, 5 e 10 mm (corte
//    grosso pela MEDIA dos cortes, como nos programas de TCFC);
//  - Reconstrucao: series que o Radix gerou (panoramica, cortes, canal);
//  - Linhas de referencia (23/11/2026): em cada quadro de plano, a linha do
//    corte que esta no quadro ATIVO (ferramenta ReferenceLines do OHIF, no
//    grupo "mpr"); ligadas por padrao, com botao para desligar;
//  - o painel recolhe para liberar a imagem.
// No quadro 3D o botao esquerdo GIRA o volume (o grupo "volume3d" fica fora
// do "mouse pratico" acima).
// ---------------------------------------------------------------------
;(function () {
  var PLANOS = [
    ['a', 'Axial', 'volume', 'axial'],
    ['s', 'Sagital', 'volume', 'sagittal'],
    ['c', 'Coronal', 'volume', 'coronal'],
    ['3', '3D', 'volume3d', 'coronal'],
  ];
  var JANELAS = [['Osso', 2000, 500], ['Partes moles', 400, 40], ['Dentes', 3000, 1000], ['Original', 0, 0]];
  var ESPESSURAS = [['0,625 mm', 0.625], ['2 mm', 2], ['5 mm', 5], ['10 mm', 10]];
  // cornerstone3D BlendModes: 0 = COMPOSITE (corte normal), 3 = AVERAGE_INTENSITY_BLEND (media)
  var MISTURA_NORMAL = 0;
  var MISTURA_MEDIA = 3;
  var painel = null;
  var recolhido = false;
  var escolhas = { planos: 'asc3', janela: '', espessura: 0.625 };
  var estudosAbertos = {};
  var escalas = {};
  var linhasLigadas = true;
  var origemLinhas = '';

  function servicos() { return window.services || null; }

  function displaySetAtivo() {
    var s = servicos();
    if (!s || !s.viewportGridService || !s.displaySetService) return null;
    try {
      var estado = s.viewportGridService.getState();
      var vp = estado.viewports.get(estado.activeViewportId);
      var uid = vp && vp.displaySetInstanceUIDs && vp.displaySetInstanceUIDs[0];
      return uid ? s.displaySetService.getDisplaySetByUID(uid) : null;
    } catch (e) { return null; }
  }

  function eTomografia(ds) {
    return !!ds && ds.Modality === 'CT' && !!ds.instances && ds.instances.length > 1;
  }

  // RECONSTRUCAO PANORAMICA (23/11/2026): series que o Radix gera no mesmo
  // estudo da tomografia (backend/app/modules/reconstrucao). A mais nova
  // (maior SeriesNumber) de cada tipo ganha um botao.
  // canal mandibular desenhado (23/11/2026): series proprias, com botoes proprios
  var DESCRICOES = {
    pano: 'RADIX - Panorâmica reconstruída',
    cortes: 'RADIX - Cortes transversais',
    panoCanal: 'RADIX - Panorâmica com canal',
    cortesCanal: 'RADIX - Cortes com canal',
  };
  var TIPOS_REC = ['pano', 'cortes', 'panoCanal', 'cortesCanal'];
  function ativos() {
    var s = servicos();
    try { return (s && s.displaySetService && s.displaySetService.getActiveDisplaySets()) || []; } catch (e) { return []; }
  }
  function eReconstrucao(ds) {
    var d = (ds && ds.SeriesDescription) || '';
    return TIPOS_REC.some(function (tipo) { return d.indexOf(DESCRICOES[tipo]) === 0; });
  }
  function reconstrucoes() {
    var achadas = { pano: null, cortes: null, panoCanal: null, cortesCanal: null };
    ativos().forEach(function (ds) {
      TIPOS_REC.forEach(function (tipo) {
        if (((ds.SeriesDescription || '').indexOf(DESCRICOES[tipo]) === 0) &&
            (!achadas[tipo] || Number(ds.SeriesNumber || 0) > Number(achadas[tipo].SeriesNumber || 0))) {
          achadas[tipo] = ds;
        }
      });
    });
    return achadas;
  }
  function abrirSerie(ds) {
    escolhas.planos = '';
    comando('setHangingProtocol', { protocolId: 'default' });
    setTimeout(function () {
      var s = servicos();
      try {
        var id = s.viewportGridService.getState().activeViewportId;
        s.viewportGridService.setDisplaySetsForViewport({ viewportId: id, displaySetInstanceUIDs: [ds.displaySetInstanceUID] });
      } catch (e) { /* ignora */ }
    }, 400);
    montar(true);
  }
  var assinatura = '';

  // todos os quadros da tela: [{ vp, e3d }]
  function quadros() {
    var s = servicos();
    var lista = [];
    if (!s || !s.viewportGridService || !s.cornerstoneViewportService) return lista;
    try {
      s.viewportGridService.getState().viewports.forEach(function (_v, id) {
        var vp = s.cornerstoneViewportService.getCornerstoneViewport(id);
        if (vp) lista.push({ vp: vp, e3d: vp.type === 'volume3d' });
      });
    } catch (e) { /* sem quadros */ }
    return lista;
  }

  function comando(nome, opcoes) {
    try { if (window.commandsManager) window.commandsManager.runCommand(nome, opcoes); } catch (e) { /* ignora */ }
  }

  // ---- escala do exame: HU ou outra (ex.: 0-4095) -----------------------
  function valoresDo(vp) {
    try {
      var d = vp.getImageData();
      if (d && d.scalarData && d.scalarData.length) return d.scalarData;
      var esc = d && d.imageData && d.imageData.getPointData().getScalars();
      return esc ? esc.getData() : null;
    } catch (e) { return null; }
  }

  // valor no exame = b + a x HU
  function escalaDoExame(vp) {
    var ds = displaySetAtivo();
    var chave = (ds && ds.displaySetInstanceUID) || 'atual';
    if (escalas[chave]) return escalas[chave];
    var dados = valoresDo(vp);
    if (!dados || !dados.length) return { a: 1, b: 0 };
    var passo = Math.max(1, Math.floor(dados.length / 200000));
    var amostra = [];
    for (var i = 0; i < dados.length; i += passo) amostra.push(dados[i]);
    amostra.sort(function (x, y) { return x - y; });
    var pct = function (p) { return amostra[Math.min(amostra.length - 1, Math.floor(p * amostra.length))]; };
    var ar = pct(0.02);
    var topo = pct(0.995);
    var escala = { a: 1, b: 0 };
    if (ar > -500 && topo > ar) {
      // pico das partes moles: o histograma (suavizado) mais alto acima do ar
      var N = 200;
      var largura = (topo - ar) / N;
      var h = new Array(N).fill(0);
      amostra.forEach(function (v) {
        var k = Math.floor((v - ar) / largura);
        if (k >= 0 && k < N) h[k] += 1;
      });
      var melhor = -1;
      var pico = 0;
      for (var k = Math.ceil(N * 0.1); k < N; k++) {
        var soma = 0;
        for (var j = Math.max(0, k - 2); j <= Math.min(N - 1, k + 2); j++) soma += h[j];
        if (soma > melhor) { melhor = soma; pico = ar + (k + 0.5) * largura; }
      }
      var a = (pico - ar) / 1040;
      if (a > 0) escala = { a: a, b: ar + 1000 * a };
    }
    escalas[chave] = escala;
    return escala;
  }

  // ---- planos ------------------------------------------------------------
  function protocolo(planos) {
    var lista = PLANOS.filter(function (p) { return planos.indexOf(p[0]) >= 0; });
    var grade = lista.length === 4 ? { rows: 2, columns: 2 } : { rows: 1, columns: lista.length };
    return {
      id: 'radix-planos-' + planos,
      name: 'Rádix - planos da tomografia',
      locked: true,
      isPreset: false,
      createdDate: '2026-11-23T00:00:00.000Z',
      modifiedDate: '2026-11-23T00:00:00.000Z',
      availableTo: {},
      editableBy: {},
      protocolMatchingRules: [],
      imageLoadStrategy: 'interleaveCenter',
      displaySetSelectors: {
        activeDisplaySet: {
          seriesMatchingRules: [{ weight: 1, attribute: 'isReconstructable', constraint: { equals: { value: true } }, required: true }],
        },
      },
      stages: [{
        id: 'radixPlanos',
        name: 'Planos',
        viewportStructure: { layoutType: 'grid', properties: grade },
        viewports: lista.map(function (p) {
          if (p[2] === 'volume3d') {
            return {
              viewportOptions: { viewportId: 'radix-3d', toolGroupId: 'volume3d', viewportType: 'volume3d', orientation: 'coronal', customViewportProps: { hideOverlays: true } },
              // mesmo formato do protocolo fourUp do OHIF 3.9
              displaySets: [{ id: 'activeDisplaySet', options: { displayPreset: { CT: 'CT-Bone', MR: 'CT-Bone', default: 'CT-Bone' } } }],
            };
          }
          return {
            viewportOptions: {
              viewportId: 'radix-' + p[3], toolGroupId: 'mpr', viewportType: 'volume', orientation: p[3],
              initialImageOptions: { preset: 'middle' },
              syncGroups: [{ type: 'voi', id: 'radix-voi', source: true, target: true, options: { syncColormap: true } }],
            },
            displaySets: [{ id: 'activeDisplaySet' }],
          };
        }),
      }],
    };
  }

  function aplicarPlanos(planos) {
    escolhas.planos = planos;
    var s = servicos();
    var id = 'radix-planos-' + planos;
    var hp = s && s.hangingProtocolService;
    // no OHIF 3.9, getProtocolById DA ERRO quando o protocolo nao existe
    // ("No protocol X found"): o erro quer dizer "registrar"
    var registrado = false;
    try { registrado = !!(hp && hp.getProtocolById(id)); } catch (e) { registrado = false; }
    try { if (hp && !registrado) hp.addProtocol(id, protocolo(planos)); } catch (e) { /* sem registro */ }
    comando('setHangingProtocol', { protocolId: id });
    origemLinhas = '';
    // os quadros novos nascem sem a janela/espessura escolhidas: reaplica
    setTimeout(reaplicar, 900);
    montar(true);
  }

  function alternarPlano(letra) {
    var atual = escolhas.planos;
    // vindo de uma reconstrucao (nenhum plano na tela): abre o plano clicado
    if (!atual) { aplicarPlanos(letra); return; }
    var tem = atual.indexOf(letra) >= 0;
    if (tem && atual.length === 1) return; // a tela nunca fica vazia
    var nova = PLANOS.map(function (p) { return p[0]; }).filter(function (l) {
      return l === letra ? !tem : atual.indexOf(l) >= 0;
    }).join('');
    aplicarPlanos(nova);
  }

  // ---- janela, 3D e espessura -------------------------------------------
  function janela(nome, largura, nivel) {
    escolhas.janela = nome;
    var planos = quadros().filter(function (q) { return !q.e3d; });
    var e = planos.length ? escalaDoExame(planos[0].vp) : { a: 1, b: 0 };
    planos.forEach(function (q) {
      try {
        if (!largura) { if (q.vp.resetProperties) q.vp.resetProperties(); }
        else {
          var baixo = e.b + e.a * (nivel - largura / 2);
          var alto = e.b + e.a * (nivel + largura / 2);
          q.vp.setProperties({ voiRange: { lower: Math.round(baixo), upper: Math.round(alto) } });
        }
        q.vp.render();
      } catch (err) { /* quadro sem janela */ }
    });
    montar(true);
  }

  function remapear(funcao, tamanho) {
    var nos = [];
    for (var i = 0; i < funcao.getSize(); i++) {
      var v = new Array(tamanho).fill(0);
      funcao.getNodeValue(i, v);
      nos.push(v);
    }
    return nos;
  }

  // 3D so osso: CT-Bone, levado para a escala do exame quando nao e HU
  function ossoNo3d() {
    quadros().forEach(function (q) {
      if (!q.e3d) return;
      var ds = displaySetAtivo();
      var chave = (ds && ds.displaySetInstanceUID) || 'atual';
      if (q.vp.__radixOsso === chave) return;
      try {
        q.vp.setProperties({ preset: 'CT-Bone' });
        var e = escalaDoExame(q.vp);
        if (e.a !== 1 || e.b !== 0) {
          var prop = q.vp.getActors()[0].actor.getProperty();
          var opac = prop.getScalarOpacity(0);
          var nosO = remapear(opac, 4);
          opac.removeAllPoints();
          nosO.forEach(function (n) { opac.addPointLong(e.b + e.a * n[0], n[1], n[2], n[3]); });
          var cor = prop.getRGBTransferFunction(0);
          var nosC = remapear(cor, 6);
          cor.removeAllPoints();
          nosC.forEach(function (n) { cor.addRGBPointLong(e.b + e.a * n[0], n[1], n[2], n[3], n[4], n[5]); });
        }
        q.vp.__radixOsso = chave;
        q.vp.render();
      } catch (err) { /* volume ainda carregando: tenta de novo */ }
    });
  }

  function espessura(mm) {
    escolhas.espessura = mm;
    quadros().forEach(function (q) {
      if (q.e3d || !q.vp.setBlendMode) return;
      try {
        q.vp.setBlendMode(mm > 0.625 ? MISTURA_MEDIA : MISTURA_NORMAL);
        q.vp.setProperties({ slabThickness: mm });
        q.vp.render();
      } catch (e) { /* ignora */ }
    });
    montar(true);
  }

  function reaplicar() {
    var j = JANELAS.filter(function (x) { return x[0] === escolhas.janela; })[0];
    if (j && j[1]) janela(j[0], j[1], j[2]);
    if (escolhas.espessura !== 0.625) espessura(escolhas.espessura);
  }

  // ---- linhas de referencia ---------------------------------------------
  function grupoPlanos() {
    var s = servicos();
    try {
      var g = s && s.toolGroupService && s.toolGroupService.getToolGroup('mpr');
      return g && g.hasTool && g.hasTool('ReferenceLines') ? g : null;
    } catch (e) { return null; }
  }

  function linhasDeReferencia() {
    var g = grupoPlanos();
    if (!g) return;
    try {
      if (!linhasLigadas) { if (g.__radixLinhas) { g.setToolDisabled('ReferenceLines'); g.__radixLinhas = false; } return; }
      var ativo = servicos().viewportGridService.getState().activeViewportId;
      if (ativo && ativo !== origemLinhas) {
        origemLinhas = ativo;
        comando('setSourceViewportForReferenceLinesTool', { viewportId: ativo });
      }
      if (!g.__radixLinhas) { g.setToolEnabled('ReferenceLines'); g.__radixLinhas = true; }
    } catch (e) { /* quadros ainda montando */ }
  }

  function alternarLinhas() {
    linhasLigadas = !linhasLigadas;
    origemLinhas = '';
    linhasDeReferencia();
    montar(true);
  }

  // ---- painel -------------------------------------------------------------
  function botao(texto, ativo, aoClicar, rotulo) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    if (rotulo) b.setAttribute('aria-label', rotulo);
    if (ativo !== null) b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    b.style.cssText = 'border-radius:6px;padding:4px 6px;font:500 12px Inter,system-ui,sans-serif;cursor:pointer;text-align:center;border:1px solid ' +
      (ativo ? '#2dd4bf;background:#0d9488;color:#fff' : '#2dd4bf55;background:#0f172a;color:#e2e8f0');
    b.addEventListener('click', aoClicar);
    return b;
  }

  function grupo(titulo, itens) {
    var g = document.createElement('div');
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', titulo);
    g.style.cssText = 'display:flex;flex-direction:column;gap:4px';
    var t = document.createElement('span');
    t.textContent = titulo;
    t.style.cssText = 'color:#94a3b8;font:600 11px Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em';
    g.appendChild(t);
    var caixa = document.createElement('div');
    caixa.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px';
    itens.forEach(function (b) { caixa.appendChild(b); });
    g.appendChild(caixa);
    return g;
  }

  function montar(refazer) {
    var grade = document.querySelector('[data-cy="viewport-grid"]');
    if (!grade || !grade.parentElement) return;
    if (painel && painel.isConnected && !refazer) return;
    if (!painel || !painel.isConnected) {
      painel = document.createElement('div');
      painel.setAttribute('role', 'toolbar');
      painel.setAttribute('aria-label', 'Tomografia');
      painel.setAttribute('aria-orientation', 'vertical');
      painel.style.cssText = 'position:absolute;top:44px;right:10px;z-index:20;display:flex;flex-direction:column;gap:10px;width:150px;max-height:calc(100% - 56px);overflow:auto;padding:8px;border-radius:10px;background:#020617e6;border:1px solid #2dd4bf55';
      var pai = grade.parentElement;
      if (getComputedStyle(pai).position === 'static') pai.style.position = 'relative';
      pai.appendChild(painel);
    }
    while (painel.firstChild) painel.removeChild(painel.firstChild);
    if (recolhido) {
      painel.style.width = 'auto';
      painel.appendChild(botao('◂ Tomografia', null, function () { recolhido = false; montar(true); }, 'Abrir painel da tomografia'));
      return;
    }
    painel.style.width = '150px';
    painel.appendChild(botao('Recolher ▸', null, function () { recolhido = true; montar(true); }, 'Recolher painel da tomografia'));
    painel.appendChild(grupo('Planos', PLANOS.map(function (p) {
      return botao(p[1], (escolhas.planos || '').indexOf(p[0]) >= 0, function () { alternarPlano(p[0]); });
    })));
    painel.appendChild(grupo('Janela', JANELAS.map(function (j) {
      return botao(j[0], escolhas.janela === j[0], function () { janela(j[0], j[1], j[2]); });
    })));
    painel.appendChild(grupo('Espessura', ESPESSURAS.map(function (e) {
      return botao(e[0], escolhas.espessura === e[1], function () { espessura(e[1]); });
    })));
    var gLinhas = grupo('Referência', [botao('Linhas de referência', linhasLigadas, alternarLinhas)]);
    gLinhas.lastChild.style.gridTemplateColumns = '1fr';
    painel.appendChild(gLinhas);
    var rec = reconstrucoes();
    var itens = [];
    if (rec.pano) itens.push(botao('Panorâmica reconstruída', false, function () { abrirSerie(rec.pano); }));
    if (rec.cortes) itens.push(botao('Cortes transversais', false, function () { abrirSerie(rec.cortes); }));
    if (rec.panoCanal) itens.push(botao('Panorâmica com canal', false, function () { abrirSerie(rec.panoCanal); }));
    if (rec.cortesCanal) itens.push(botao('Cortes com canal', false, function () { abrirSerie(rec.cortesCanal); }));
    if (itens.length) {
      var g = grupo('Reconstrução', itens);
      g.lastChild.style.gridTemplateColumns = '1fr';
      painel.appendChild(g);
    }
  }

  function desmontar() {
    if (painel && painel.parentNode) painel.parentNode.removeChild(painel);
    painel = null;
    document.body.classList.remove('radix-tc');
  }

  function verificar() {
    var ds = displaySetAtivo();
    // com a reconstrucao aberta (serie OT), o painel continua: o estudo tem
    // a tomografia
    var tc = eTomografia(ds) || (eReconstrucao(ds) && ativos().some(eTomografia));
    if (!tc) { desmontar(); return; }
    document.body.classList.add('radix-tc');
    var rec = reconstrucoes();
    var nova = TIPOS_REC.map(function (tipo) { return rec[tipo] ? rec[tipo].displaySetInstanceUID : ''; }).join('|');
    if (nova !== assinatura) { assinatura = nova; montar(true); }
    var estudo = ds.StudyInstanceUID || ds.displaySetInstanceUID;
    if (!estudosAbertos[estudo]) {
      // abre sozinha com os 4 planos (axial, sagital, coronal e 3D), uma vez por estudo
      estudosAbertos[estudo] = true;
      escolhas = { planos: 'asc3', janela: '', espessura: 0.625 };
      aplicarPlanos('asc3');
    }
    ossoNo3d();
    linhasDeReferencia();
    montar(false);
  }
  setInterval(verificar, 700);
})();
