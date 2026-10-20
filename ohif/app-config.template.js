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
    { style: { display: 'flex', alignItems: 'center', gap: '8px', color: '#F8FAFC', fontWeight: 600, fontSize: '14px', letterSpacing: '.02em', fontFamily: 'Inter, system-ui, sans-serif' } },
    React.createElement('span', { style: { width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', display: 'grid', placeItems: 'center' } },
    React.createElement('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: '#fff' },
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
    '*{scrollbar-color:#2F3B48 transparent}'
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
// CURADORIA: RECOLHER A COLUNA "STUDIES" DO OHIF
// Com radixRecolherEstudos=1 na URL (usado pela tela de Curadoria, que
// mostra os dados da imagem na coluna da direita do proprio Radix), a
// coluna "Studies" da esquerda do OHIF e recolhida uma vez, assim que
// aparece - a radiografia ganha essa largura. O mesmo botao do OHIF abre
// a coluna de novo, se a pessoa quiser. Sem o parametro, nada muda.
// ---------------------------------------------------------------------
;(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('radixRecolherEstudos') !== '1') return;
  var tentativas = 0;
  var relogio = setInterval(function () {
    tentativas++;
    var painel = document.querySelector('[data-cy="studyBrowser-panel"]');
    var botao = document.querySelector('[data-cy="side-panel-header-left"]');
    if (painel && botao) { botao.click(); clearInterval(relogio); return; }
    if (tentativas > 120) clearInterval(relogio); // ~30 s: desiste em silencio
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
// e enviada para a origem do proprio Radix (lida do document.referrer) e
// leva apenas o identificador do estudo (anonimizado) - nenhum dado pessoal.
// ---------------------------------------------------------------------
;(function () {
  var params = new URLSearchParams(window.location.search);
  var grade = /^(\d{1,2})x(\d{1,2})$/.exec(params.get('radixGrade') || '');
  var ordem = (params.get('StudyInstanceUIDs') || '').split(',').filter(Boolean);
  if (!grade || ordem.length < 2) return;
  var linhas = Math.min(+grade[1], 4);
  var colunas = Math.min(+grade[2], 5);
  var origemRadix = '';
  try { origemRadix = document.referrer ? new URL(document.referrer).origin : ''; } catch (e) { origemRadix = ''; }

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
      if (pares.length) s.viewportGridService.setDisplaySetsForViewports(pares);
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
// So aceita mensagens da origem do Radix (lida do document.referrer).
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
  var origemRadix = '';
  try { origemRadix = document.referrer ? new URL(document.referrer).origin : ''; } catch (e) { origemRadix = ''; }
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
    if (typeof d.espacoDireita === 'number' && isFinite(d.espacoDireita)) {
      estado.espacoDireita = Math.max(0, Math.min(d.espacoDireita, window.innerWidth));
      aplicarEspaco(0);
    }
  });

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
  function cor(m) { return (m && m.achado && CORES[m.achado]) || '#FFFFFF'; }

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
    if (m.tipo === 'oval') {
      for (k = 0; k < 72; k++) {
        var t = (k / 72) * Math.PI * 2;
        pts.push(tela(x + w / 2 + (w / 2) * Math.cos(t), y + h / 2 + (h / 2) * Math.sin(t)));
      }
    } else {
      pts = [tela(x, y), tela(x + w, y), tela(x + w, y + h), tela(x, y + h)];
    }
    var ancora;
    if (m.tipo === 'oval') {
      var rx = w / 2, ry = h / 2;
      ancora = tela(x + rx - rx * Math.SQRT1_2, y + ry - ry * Math.SQRT1_2);
    } else ancora = tela(x, y);
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
    var a = g.seta.a, b = g.seta.b, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    var r = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) / 2 + 30, pts = [];
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
