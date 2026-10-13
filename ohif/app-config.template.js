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
    wadoUriRoot: 'http://localhost:8042/wado',
    qidoRoot: 'http://localhost:8042/dicom-web',
    wadoRoot: 'http://localhost:8042/dicom-web',
    qidoSupportsIncludeField: false,
    supportsReject: false,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    enableStudyLazyLoad: true,
    supportsFuzzyMatching: false,
    supportsWildcard: true,
    staticWado: false,
    singlepart: 'bulkdata,video',
    requestOptions: {
    auth: '__ORTHANC_AUTH_BASIC__'
    }
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
;(function () {
  if (window.parent === window) return;
  var origemRadix = '';
  try { origemRadix = document.referrer ? new URL(document.referrer).origin : ''; } catch (e) { origemRadix = ''; }
  if (!origemRadix) return;

  var NS = 'http://www.w3.org/2000/svg';
  var estado = { estudos: {}, visiveis: {} };
  var rodando = false;

  window.addEventListener('message', function (ev) {
    if (ev.origin !== origemRadix) return;
    var d = ev.data;
    if (!d || d.tipo !== 'radix-marcacoes') return;
    estado.estudos = d.estudos || {};
    estado.visiveis = {};
    (d.visiveis || []).forEach(function (uid) { estado.visiveis[uid] = true; });
    iniciar();
  });

  // avisa a tela do Radix que esta pronto para receber as marcacoes
  var avisos = 0;
  var avisar = setInterval(function () {
    avisos++;
    if (window.services) {
      try { window.parent.postMessage({ tipo: 'radix-ohif-pronto' }, origemRadix); } catch (e) { /* ignora */ }
    }
    if (avisos > 40) clearInterval(avisar);
  }, 500);

  function el(nome, attrs) {
    var n = document.createElementNS(NS, nome);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // caixinha com a descricao da marcacao, que aparece ao passar o mouse
  // sobre o numero (ou sobre a propria forma) - fica fora do SVG porque o
  // SVG e redesenhado a cada quadro
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

  function dentroPoligono(px, py, pts) {
    var dentro = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) dentro = !dentro;
    }
    return dentro;
  }
  function distSegmento(px, py, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
    var cx = a[0] + t * dx, cy = a[1] + t * dy;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
  }
  // qual marcacao esta sob o mouse: o numero tem prioridade; depois a forma
  // menor (a mais "de dentro"), para formas sobrepostas
  function marcacaoSob(alvos, px, py) {
    var i, achado = null, menorArea = Infinity;
    for (i = alvos.length - 1; i >= 0; i--) {
      var n = alvos[i].numero;
      if (Math.sqrt((px - n[0]) * (px - n[0]) + (py - n[1]) * (py - n[1])) <= 13) return alvos[i];
    }
    for (i = 0; i < alvos.length; i++) {
      var a = alvos[i];
      if (a.seta) { if (distSegmento(px, py, a.seta[0], a.seta[1]) <= 6) return a; continue; }
      if (a.pts && dentroPoligono(px, py, a.pts) && a.area < menorArea) { achado = a; menorArea = a.area; }
    }
    return achado;
  }
  function ouvirMouse(alvo) {
    if (alvo.__radixOuvindo) return;
    alvo.__radixOuvindo = true;
    alvo.addEventListener('mousemove', function (ev) {
      var alvos = alvo.__radixAlvos || [];
      if (!alvos.length) { esconderDica(); return; }
      var r = alvo.getBoundingClientRect();
      var m = marcacaoSob(alvos, ev.clientX - r.left, ev.clientY - r.top);
      if (m) mostrarDica(m.texto, ev.clientX, ev.clientY); else esconderDica();
    });
    alvo.addEventListener('mouseleave', esconderDica);
  }

  function algumVisivel() {
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
      if (lista[i].parentNode) lista[i].parentNode.__radixAlvos = [];
      lista[i].remove();
    }
    esconderDica();
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
      var lista = uid && estado.visiveis[uid] ? (estado.estudos[uid] || []) : [];
      if (!lista.length) { if (svg) svg.remove(); alvo.__radixAlvos = []; return; }

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
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var numeros = [];
      var alvos = [];
      ouvirMouse(alvo);
      var defs = el('defs', {});
      var marker = el('marker', { id: 'radix-ponta-' + id, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' });
      marker.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#ffffff' }));
      defs.appendChild(marker);
      svg.appendChild(defs);

      lista.forEach(function (m, indice) {
        // numero da marcacao (ordem em que o curador marcou), no canto de
        // cima/esquerda da forma ou na cauda da seta - igual ao Radix
        var ancora;
        if (m.tipo === 'seta') ancora = tela(m.x1 || 0, m.y1 || 0);
        else if (m.tipo === 'oval') {
          var rx0 = (m.largura || 0) / 2, ry0 = (m.altura || 0) / 2;
          ancora = tela((m.x || 0) + rx0 - rx0 * Math.SQRT1_2, (m.y || 0) + ry0 - ry0 * Math.SQRT1_2);
        } else ancora = tela(m.x || 0, m.y || 0);
        numeros.push({ n: indice + 1, p: ancora });
        var texto = m.texto || ('Marca\u00e7\u00e3o ' + (indice + 1));
        if (m.tipo === 'seta') {
          var a = tela(m.x1 || 0, m.y1 || 0), b = tela(m.x2 || 0, m.y2 || 0);
          alvos.push({ texto: texto, numero: ancora, seta: [a, b] });
          svg.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#ffffff', 'stroke-width': '2', 'marker-end': 'url(#radix-ponta-' + id + ')' }));
          return;
        }
        var x = m.x || 0, y = m.y || 0, w = m.largura || 0, h = m.altura || 0;
        var pts = [];
        if (m.tipo === 'oval') {
          for (var k = 0; k < 48; k++) {
            var ang = (k / 48) * Math.PI * 2;
            pts.push(tela(x + w / 2 + (w / 2) * Math.cos(ang), y + h / 2 + (h / 2) * Math.sin(ang)));
          }
        } else {
          pts = [tela(x, y), tela(x + w, y), tela(x + w, y + h), tela(x, y + h)];
        }
        var area = 0;
        for (var q = 0, z = pts.length - 1; q < pts.length; z = q++) area += (pts[z][0] + pts[q][0]) * (pts[z][1] - pts[q][1]);
        alvos.push({ texto: texto, numero: ancora, pts: pts, area: Math.abs(area / 2) });
        svg.appendChild(el('polygon', {
          points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '),
          stroke: '#ffffff', 'stroke-width': '1.5', 'stroke-opacity': '0.9', fill: 'rgba(255,255,255,0.18)'
        }));
      });
      alvo.__radixAlvos = alvos;
      // os numeros por ultimo, para ficarem por cima das formas
      numeros.forEach(function (item) {
        svg.appendChild(el('circle', { cx: item.p[0], cy: item.p[1], r: '10', fill: '#fbbf24', stroke: '#ffffff', 'stroke-width': '1.5' }));
        var tx = el('text', { x: item.p[0], y: item.p[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': '12', 'font-weight': '700', 'font-family': 'Inter, Arial, sans-serif', fill: '#000000' });
        tx.textContent = String(item.n);
        svg.appendChild(tx);
      });
    });
  }
})();
