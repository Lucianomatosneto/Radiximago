// Motor visual da tela de entrada (login) do RÁDIX IMAGO.
//
// Desenha, atras do formulario:
//   1. um globo terrestre em pontos (WebGL, biblioteca Three.js), branco-gelo;
//   2. sete imagens ilustrativas (geradas por IA, sem nenhum dado de paciente)
//      correndo em duas faixas retas, na frente e atras do globo;
//   3. estrelas cadentes num <canvas> 2D separado.
//
// Ciclo do globo (repete sem parar, ~23 s):
//   ENTRA (3 s)  -> vem do fundo como um meteoro, com rastro de luz;
//   FICA  (16 s) -> as imagens surgem e correm em duas faixas retas (frente e fundo);
//   SAI   (~2 s) -> as imagens se recolhem e o globo se afasta ate sumir;
//   PAUSA (1,8 s)-> tela escura com "chuva" de estrelas; depois recomeca.
//
// Regra de layout: o globo fica centralizado no espaco a direita da coluna de
// login, e as imagens se dissolvem antes de alcancar essa coluna.
//
// Acessibilidade: com "reduzir movimento" ativado no sistema operacional, a
// cena fica parada (um unico quadro) e nao ha estrelas cadentes.
//
// Este modulo nao faz nenhuma requisicao de rede alem das imagens estaticas
// em /public/login e nao le nem grava dados da pessoa (LGPD).

import * as THREE from 'three'

export interface OpcoesCenaLogin {
  canvasGlobo: HTMLCanvasElement
  canvasCeu: HTMLCanvasElement
  rastro: HTMLElement
  /** Largura (px) da coluna de texto/login a esquerda; o globo fica centralizado no espaco restante. 0 no celular. */
  obterMargemEsquerda: () => number
  /** Avisa qual imagem (0-6) da faixa da frente esta mais ao centro, ou -1. */
  aoMudarFoco?: (indice: number) => void
  /** Avisa a longitude (graus, -180..180) voltada para a frente. */
  aoMudarLongitude?: (longitude: number) => void
  /** Caminhos das 7 imagens, na ordem: RM, TC torax, coracao, panoramica, celulas, arvore, cao. */
  imagens: string[]
  /** Mascara dos continentes (equiretangular, branco = terra). */
  mascaraContinentes: string
}

// Paleta escolhida: globo "branco-gelo" sobre o fundo "noite ate turquesa".
const COR_PONTOS = '#FFFFFF'
const COR_OCEANO = '#0B1A24'
const COR_BORDA = '#DCEFFF'
const COR_HALO = '#F0F9FF'
const FUNDO_QUADRO = '#000000'

const LARGURA_CELULAR = 1023   // abaixo do breakpoint "lg" do Tailwind (1024 px)

/** Controles da barra de ferramentas do visualizador. */
export interface ControleCena {
  alternarPausa: () => boolean
  aproximar: () => void
  afastar: () => void
  redefinir: () => void
  avancar: () => void
}

const controleVazio: ControleCena = { alternarPausa: () => false, aproximar: () => {}, afastar: () => {}, redefinir: () => {}, avancar: () => {} }

/** Inicia a cena e devolve uma funcao que desliga tudo e os controles. */
export function iniciarCenaLogin(op: OpcoesCenaLogin): { desligar: () => void; controle: ControleCena } {
  const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const desligarCeu = iniciarEstrelas(op.canvasCeu, reduzirMovimento)
  let desligarGlobo: () => void = () => {}
  let controle = controleVazio
  try {
    const g = iniciarGlobo(op, reduzirMovimento)
    desligarGlobo = g.desligar; controle = g.controle
  } catch {
    // Navegador sem WebGL: a tela continua funcionando, so sem o globo.
  }
  return { desligar: () => { desligarCeu(); desligarGlobo() }, controle }
}

// Visibilidade atual do globo (0 a 1), compartilhada com as estrelas:
// quando o globo some, cai uma chuva de estrelas.
let visibilidadeGlobo = 1

// ---------------------------------------------------------------------------
// Estrelas cadentes (canvas 2D)
// ---------------------------------------------------------------------------
interface Estrela { x: number; y: number; vx: number; vy: number; comp: number; vida: number; dur: number; esp: number }

function iniciarEstrelas(cv: HTMLCanvasElement, reduzir: boolean): () => void {
  const ctx = cv.getContext('2d')
  if (!ctx || reduzir) return () => {}
  let W = 1, H = 1, raf = 0, ativo = true
  const tamanho = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth; H = window.innerHeight
    cv.width = W * dpr; cv.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  window.addEventListener('resize', tamanho); tamanho()
  const lista: Estrela[] = []
  let proxima = 0.6, ultimo = performance.now()
  const criar = () => {
    const ang = Math.PI * (0.8 + Math.random() * 0.12)
    const vel = (W + H) * (0.55 + Math.random() * 0.45)
    lista.push({ x: Math.random() * W * 1.1, y: -20 + Math.random() * H * 0.75, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel * 0.6 + vel * 0.25,
      comp: 90 + Math.random() * 170, vida: 0, dur: 0.7 + Math.random() * 0.8, esp: 0.8 + Math.random() * 1.1 })
  }
  const quadro = (agora: number) => {
    if (!ativo) return
    const dt = Math.min(0.05, (agora - ultimo) / 1000); ultimo = agora
    proxima -= dt
    if (visibilidadeGlobo < 0.3) {          // globo ausente: chuva intensa (~50 por segundo)
      proxima = Math.min(proxima, 0.05)
      while (proxima <= 0) { criar(); proxima += 0.012 + Math.random() * 0.025 }
    }
    if (proxima <= 0) { criar(); if (Math.random() < 0.25) criar(); proxima = 1.1 + Math.random() * 2.2 }
    ctx.clearRect(0, 0, W, H)
    for (let i = lista.length - 1; i >= 0; i--) {
      const s = lista[i]; s.vida += dt
      const u = s.vida / s.dur
      if (u >= 1) { lista.splice(i, 1); continue }
      s.x += s.vx * dt; s.y += s.vy * dt
      const a = Math.sin(Math.PI * Math.min(1, u * 1.1)), m = Math.hypot(s.vx, s.vy)
      const tx = s.x - (s.vx / m) * s.comp, ty = s.y - (s.vy / m) * s.comp
      const g = ctx.createLinearGradient(tx, ty, s.x, s.y)
      g.addColorStop(0, 'rgba(160,240,230,0)'); g.addColorStop(0.7, `rgba(200,245,240,${0.45 * a})`); g.addColorStop(1, `rgba(255,255,255,${0.95 * a})`)
      ctx.strokeStyle = g; ctx.lineWidth = s.esp; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke()
      ctx.fillStyle = `rgba(235,250,248,${0.9 * a})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.esp * 1.1, 0, Math.PI * 2); ctx.fill()
    }
    raf = requestAnimationFrame(quadro)
  }
  raf = requestAnimationFrame(quadro)
  return () => { ativo = false; cancelAnimationFrame(raf); window.removeEventListener('resize', tamanho) }
}

// ---------------------------------------------------------------------------
// Globo + imagens em orbita (WebGL / Three.js)
// ---------------------------------------------------------------------------
const VS_GLOBO = `varying vec3 vP;varying vec3 vN;varying vec3 vV;
void main(){vP=normalize(position);vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`

// Pontos dos continentes amostrados numa grade de latitude/longitude; borda
// luminosa (efeito Fresnel). Mistura aditiva: o "oceano" e transparente.
const FS_GLOBO = `precision highp float;uniform sampler2D land;uniform float uT;uniform float uA;uniform vec3 uDot,uOcean,uRim;
varying vec3 vP;varying vec3 vN;varying vec3 vV;const float PI=3.14159265;
float L(float la,float lo){return texture2D(land,vec2(lo/(2.*PI)+.5,.5+la/PI)).r;}
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){float la=asin(clamp(vP.y,-1.,1.)),lo=atan(-vP.z,vP.x);float dL=PI/180.;
 float row=floor((la+PI*.5)/dL),lac=(row+.5)*dL-PI*.5;float nc=max(1.,floor(2.*PI*cos(lac)/dL)),dLo=2.*PI/nc;
 float col=floor((lo+PI)/dLo),loc=(col+.5)*dLo-PI;float d=length(vec2((lo-loc)*cos(lac),la-lac))/dL;float aa=max(fwidth(d),.03);
 float isL=smoothstep(.35,.65,L(lac,loc));float r=h(vec2(row,col));
 float dot1=(1.-smoothstep(.34-aa,.34+aa,d))*isL*(.6+.4*r);
 float tw=step(.992,r)*isL*(.5+.5*sin(uT*2.+r*80.));
 float f=clamp(dot(normalize(vN),normalize(vV)),0.,1.);
 float edge=smoothstep(.08,.5,f);
 vec3 c=(uDot*dot1*(1.25+.5*f)+vec3(.85,.95,1.)*tw*1.4*f)*edge*uA;
 c+=(uOcean*0.+uRim*pow(1.-f,4.)*.35)*uA;
 gl_FragColor=vec4(c,max(max(c.r,c.g),c.b));}`

const VS_HALO = `varying vec3 vN;varying vec3 vV;void main(){vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`
const FS_HALO = `uniform float pw,k;uniform vec3 uC;varying vec3 vN;varying vec3 vV;
void main(){float f=clamp(abs(dot(normalize(vN),normalize(vV))),0.,1.);float i=pow(f,pw)*k*(1.-smoothstep(.36,.47,f));gl_FragColor=vec4(uC*i,i);}`

const VS_ARCO = `attribute float t;attribute float ph;varying float vt;varying float vp;varying float vf;
void main(){vt=t;vp=ph;vec4 w=modelMatrix*vec4(position,1.);vf=dot(normalize(w.xyz),normalize(cameraPosition-w.xyz));gl_Position=projectionMatrix*viewMatrix*w;}`
const FS_ARCO = `uniform float uT,uA;uniform vec3 uArc;varying float vt;varying float vp;varying float vf;
void main(){float hd=fract(uT*.18+vp);float d=vt-hd;float p=exp(-d*d*300.)*step(d,0.)+exp(-d*d*3000.);
 float a=(.18+1.8*p)*smoothstep(-.1,.25,vf)*uA;gl_FragColor=vec4(mix(uArc,vec3(.92,.98,1.),p)*a,a);}`

const VS_QUADRO = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
// Quadro 16:9 com cantos arredondados e contorno claro; a figura (com
// transparencia) e desenhada sobre o fundo do quadro.
const FS_QUADRO = `precision highp float;uniform sampler2D map;uniform float uO,uB;uniform vec3 uBg;varying vec2 vUv;
float sdb(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
void main(){vec2 p=(vUv-.5)*vec2(16./9.,1.);float d=sdb(p,vec2(8./9.,.5),.07);float aa=fwidth(d);
 float a=1.-smoothstep(-aa,aa,d);float br=1.-smoothstep(0.,aa*1.6,abs(d+.012));
 vec3 bg=uBg;
 vec4 t=texture2D(map,vUv);vec3 c=mix(bg,t.rgb,t.a)*uB;c=mix(c,vec3(.75,.88,1.),br*.8);
 gl_FragColor=vec4(c,a*uO);}`

// Cidades ligadas por rotas de luz (Florianopolis e a primeira).
const CIDADES: [number, number][] = [[-27.6, -48.5], [-23.5, -46.6], [40.7, -74], [51.5, -0.1], [48.9, 2.3], [52.5, 13.4], [35.7, 139.7], [1.35, 103.8],
  [-33.9, 151.2], [19.4, -99.1], [-1.3, 36.8], [28.6, 77.2], [-33.9, 18.4], [43.7, -79.4], [4.7, -74.1], [37.6, 127]]
const ROTAS: [number, number][] = [[0, 2], [0, 3], [0, 4], [0, 12], [0, 8], [1, 14], [2, 3], [3, 5], [5, 11], [11, 7], [7, 6], [6, 15], [2, 9], [9, 13], [4, 10], [10, 12], [7, 8], [13, 3]]

function iniciarGlobo(op: OpcoesCenaLogin, reduzir: boolean): { desligar: () => void; controle: ControleCena } {
  // Cores exatamente como escritas (sem conversao de espaco de cor), para
  // ficar identico ao prototipo aprovado.
  THREE.ColorManagement.enabled = false

  const R = new THREE.WebGLRenderer({ canvas: op.canvasGlobo, antialias: true, alpha: true })
  R.outputColorSpace = THREE.LinearSRGBColorSpace
  R.setClearColor(0x000000, 0)
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const cena = new THREE.Scene()
  // Campo de visao bem estreito (5 graus): camera "quase ortografica", sem
  // distorcer o centro do globo.
  const cam = new THREE.PerspectiveCamera(5, 1, 0.01, 400)
  cam.position.set(0, 0, 6)
  const inclinacao = new THREE.Group(); inclinacao.rotation.set(0.18, 0, 0.06); cena.add(inclinacao)
  const giro = new THREE.Group(); inclinacao.add(giro)

  const descartaveis: { dispose: () => void }[] = []
  const guardar = <T extends { dispose: () => void }>(o: T) => { descartaveis.push(o); return o }

  // --- globo ---
  const mascara = guardar(new THREE.TextureLoader().load(op.mascaraContinentes))
  mascara.minFilter = THREE.LinearFilter
  const matGlobo = guardar(new THREE.ShaderMaterial({
    uniforms: { land: { value: mascara }, uT: { value: 0 }, uA: { value: 0 },
      uDot: { value: new THREE.Color(COR_PONTOS) }, uOcean: { value: new THREE.Color(COR_OCEANO) }, uRim: { value: new THREE.Color(COR_BORDA) } },
    vertexShader: VS_GLOBO, fragmentShader: FS_GLOBO, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  }))
  giro.add(new THREE.Mesh(guardar(new THREE.SphereGeometry(1, 160, 120)), matGlobo))

  const matHalo = guardar(new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { pw: { value: 5 }, k: { value: 0.55 }, uC: { value: new THREE.Color(COR_HALO) } }, vertexShader: VS_HALO, fragmentShader: FS_HALO,
  }))
  inclinacao.add(new THREE.Mesh(guardar(new THREE.SphereGeometry(1.1, 96, 64)), matHalo))

  // --- rotas entre cidades ---
  const paraVetor = (la: number, lo: number, r: number) => {
    la *= Math.PI / 180; lo *= Math.PI / 180
    return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(r)
  }
  const matArco = guardar(new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uArc: { value: new THREE.Color(COR_HALO) } }, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, vertexShader: VS_ARCO, fragmentShader: FS_ARCO,
  }))
  const P: number[] = [], T: number[] = [], H: number[] = []
  ROTAS.forEach(([i, j], k) => {
    const A = paraVetor(CIDADES[i][0], CIDADES[i][1], 1), B = paraVetor(CIDADES[j][0], CIDADES[j][1], 1), ang = A.angleTo(B), N = 80
    let anterior: THREE.Vector3 | null = null
    for (let s = 0; s <= N; s++) {
      const u = s / N
      const v = A.clone().lerp(B, u).normalize().multiplyScalar(1.006 + Math.sin(Math.PI * u) * ang * 0.18)
      if (anterior) { P.push(anterior.x, anterior.y, anterior.z, v.x, v.y, v.z); T.push((s - 1) / N, u); H.push(k * 0.137, k * 0.137) }
      anterior = v
    }
  })
  const geoArcos = guardar(new THREE.BufferGeometry())
  geoArcos.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  geoArcos.setAttribute('t', new THREE.Float32BufferAttribute(T, 1))
  geoArcos.setAttribute('ph', new THREE.Float32BufferAttribute(H, 1))
  giro.add(new THREE.LineSegments(geoArcos, matArco))

  const cvPonto = document.createElement('canvas'); cvPonto.width = cvPonto.height = 64
  const cx2 = cvPonto.getContext('2d')
  if (cx2) {
    const gr = cx2.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, 'rgba(225,245,255,.9)'); gr.addColorStop(1, 'rgba(160,220,255,0)')
    cx2.fillStyle = gr; cx2.fillRect(0, 0, 64, 64)
  }
  const matCidades = guardar(new THREE.PointsMaterial({ opacity: 0, map: guardar(new THREE.CanvasTexture(cvPonto)), size: 0.035, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  giro.add(new THREE.Points(guardar(new THREE.BufferGeometry().setFromPoints(CIDADES.map((c) => paraVetor(c[0], c[1], 1.008)))), matCidades))

  // --- imagens em duas faixas retas ---
  const anel = new THREE.Group(); anel.rotation.set(0.1, 0, 0.03); cena.add(anel)
  const ALTURA_QUADRO = 0.52
  const carregador = new THREE.TextureLoader()
  const geoQuadro = guardar(new THREE.PlaneGeometry((ALTURA_QUADRO * 16) / 9, ALTURA_QUADRO))
  const quadros = op.imagens.map((src) => {
    const tx = guardar(carregador.load(src)); tx.anisotropy = R.capabilities.getMaxAnisotropy(); tx.minFilter = THREE.LinearMipmapLinearFilter
    const m = guardar(new THREE.ShaderMaterial({
      uniforms: { map: { value: tx }, uO: { value: 0 }, uB: { value: 1 }, uBg: { value: new THREE.Color(FUNDO_QUADRO) } },
      vertexShader: VS_QUADRO, fragmentShader: FS_QUADRO, transparent: true, depthWrite: false,
    }))
    const malha = new THREE.Mesh(geoQuadro, m); anel.add(malha); return malha
  })
  const posMundo = new THREE.Vector3()

  // --- enquadramento: globo centralizado no espaco a direita da coluna de login ---
  let zFinal = 10, W = 1, Hh = 1, CX = 0, CY = 0, margem = 0
  let zoom = 1.44, zoomAlvo = 1.44   // zoom inicial aprovado (equivale a 2 cliques de aproximar)
  const enquadrar = () => {
    const w = window.innerWidth, h = window.innerHeight
    W = w; Hh = h; R.setSize(w, h, false); cam.aspect = w / h
    margem = w <= LARGURA_CELULAR ? 0 : op.obterMargemEsquerda()
    const livre = w - margem
    const raio = w <= LARGURA_CELULAR ? Math.min(0.42 * w, 0.2 * h) / 1.44 : Math.min(0.36 * h, 0.3 * livre)
    CX = margem + livre / 2; CY = w <= LARGURA_CELULAR ? h * 0.43 : h * 0.52
    zFinal = h / (2 * raio * Math.tan((cam.fov * Math.PI) / 360))
  }
  window.addEventListener('resize', enquadrar); enquadrar()
  const reenquadrar = window.setTimeout(enquadrar, 400)
  document.fonts?.ready.then(() => { if (ativo) enquadrar() })

  // --- ciclo ---
  const ENTRA = 3, FICA = 16, RECOLHE = 0.8, SAI = 1.4, PAUSA = 1.8, CICLO = ENTRA + FICA + 0.5 + SAI + PAUSA
  const VELOCIDADE = 0.1, ROTACAO_INICIAL = -3.506   // chega mostrando a Europa e segue para o Atlantico
  const suaveSaida = (x: number) => 1 - Math.pow(1 - x, 3), suaveEntrada = (x: number) => x * x * x
  const lim = (x: number) => Math.max(0, Math.min(1, x))

  let ct = reduzir ? ENTRA + 5 : 0, ultimo = performance.now(), px: number | null = null, py: number | null = null, cicloAtual = -1
  let raf = 0, ativo = true, pausado = false, focoAtual = -2, lonAnterior = 999

  const aplicar = (dt: number) => {
    const n = Math.floor(ct / CICLO)
    if (n !== cicloAtual) { cicloAtual = n; giro.rotation.y = ROTACAO_INICIAL; px = null }
    const c = ct - n * CICLO, u = lim(c / ENTRA), k = suaveSaida(u)
    const saida = suaveEntrada(lim((c - ENTRA - FICA - 0.5) / SAI))
    const gx = CX + (W * 1.15 - CX) * (1 - k), gy = CY + (-Hh * 0.25 - CY) * (1 - k)
    cam.setViewOffset(W, Hh, -(gx - W / 2), -(gy - Hh / 2), W, Hh)
    cam.position.z = (zFinal / zoom) * (1 + 9 * (1 - k)) * (1 + 13 * saida); cam.updateProjectionMatrix()
    const vis = lim(c / 0.5) * (1 - saida); visibilidadeGlobo = reduzir ? 1 : vis
    matGlobo.uniforms.uA.value = vis; matArco.uniforms.uA.value = k * (1 - saida); matCidades.opacity = k * (1 - saida); matHalo.uniforms.k.value = 0.18 * vis

    // rastro do meteoro (so na entrada)
    if (px !== null && py !== null && dt > 0 && u < 1) {
      const vx = (gx - px) / dt, vy = (gy - py) / dt, vel = Math.hypot(vx, vy)
      const comp = Math.min(Math.hypot(W, Hh) * 0.45, vel * 0.45), ang = Math.atan2(vy, vx)
      op.rastro.style.width = `${comp}px`
      op.rastro.style.opacity = String(Math.min(1, vel / 600) * (1 - u * u) * lim(c / 0.3))
      op.rastro.style.transform = `translate(${gx - comp}px,${gy - 1.5}px) rotate(${ang}rad)`
    } else op.rastro.style.opacity = '0'
    px = gx; py = gy

    // imagens: surgem depois da chegada e se recolhem antes da saida.
    // Faixa da frente (indices pares): da esquerda para a direita, maior e nitida.
    // Faixa de tras (indices impares, atras do globo): da direita para a esquerda, menor e mais escura.
    const recolher = suaveSaida(lim((c - ENTRA - FICA) / RECOLHE))
    const T = (giro.rotation.y - ROTACAO_INICIAL) * 2.4, X = 2.3, L = 2 * X
    const dar = (v: number) => (((v % L) + L) % L) - X
    let foco = -1, menorDist = 1e9
    quadros.forEach((q, i) => {
      const ap = suaveSaida(lim((c - ENTRA - 0.15 - i * 0.32) / 0.9)) * (1 - recolher)
      const frente = i % 2 === 0, k2 = frente ? i / 2 : (i - 1) / 2, n2 = frente ? 4 : 3
      const x = frente ? dar(-X + (k2 * L) / n2 + T) : dar(X - (k2 * L) / n2 - T * 0.8)
      q.position.set(x, frente ? -0.16 : 0.3, frente ? 1.55 : -1.55)
      q.quaternion.copy(anel.quaternion).invert()
      const borda = lim((X - Math.abs(x)) / 0.7), b2 = borda * borda * (3 - 2 * borda)
      q.getWorldPosition(posMundo)
      const proj = posMundo.clone().project(cam), sx = ((proj.x + 1) / 2) * W
      // dissolve antes de chegar a coluna de login
      const fx = margem ? lim((sx - (margem + 140)) / 240) : 1, f2 = fx * fx * (3 - 2 * fx)
      q.scale.setScalar(Math.max(0.0001, ap * (frente ? 0.86 : 0.66)))
      q.visible = ap > 0.001 && borda > 0.001
      const mq = q.material as THREE.ShaderMaterial
      mq.uniforms.uB.value = frente ? 1 : 0.62
      mq.uniforms.uO.value = ap * f2 * b2 * (frente ? 1 : 0.85)
      q.renderOrder = frente ? 5 : -1
      if (frente && ap > 0.5 && fx > 0.5) { const d = Math.abs(sx - (margem + (W - margem) / 2)); if (d < menorDist) { menorDist = d; foco = i } }
    })
    if (foco !== focoAtual) { focoAtual = foco; op.aoMudarFoco?.(foco) }
    const th = (giro.rotation.y * 180) / Math.PI, lon = ((((-90 - th) % 360) + 540) % 360) - 180
    if (Math.abs(lon - lonAnterior) > 0.5) { lonAnterior = lon; op.aoMudarLongitude?.(lon) }
  }

  const quadro = (agora: number) => {
    if (!ativo) return
    const d = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora
    zoom += (zoomAlvo - zoom) * Math.min(1, d * 6)
    if (!pausado) {
      ct += d
      const c = ct - Math.floor(ct / CICLO) * CICLO, k = lim(c / ENTRA)
      giro.rotation.y += d * (VELOCIDADE + 1.2 * Math.pow(1 - k, 2))
    }
    aplicar(d)
    matGlobo.uniforms.uT.value = ct; matArco.uniforms.uT.value = ct
    R.render(cena, cam)
    raf = requestAnimationFrame(quadro)
  }
  if (reduzir) {
    // quadro unico, parado; redesenha so quando as texturas terminam de carregar ou a janela muda
    const desenhar = () => { enquadrar(); aplicar(0); R.render(cena, cam) }
    THREE.DefaultLoadingManager.onLoad = desenhar
    window.addEventListener('resize', desenhar)
    desenhar()
    descartaveis.push({ dispose: () => window.removeEventListener('resize', desenhar) })
  } else raf = requestAnimationFrame(quadro)

  const controle: ControleCena = {
    alternarPausa: () => { pausado = !pausado; return pausado },
    aproximar: () => { zoomAlvo = Math.min(2.6, zoomAlvo * 1.2) },
    afastar: () => { zoomAlvo = Math.max(0.6, zoomAlvo / 1.2) },
    redefinir: () => { zoomAlvo = 1.44 },
    avancar: () => { giro.rotation.y += 0.55 },   // adianta a rotacao: a proxima imagem passa ao centro
  }
  return {
    controle,
    desligar: () => {
      ativo = false; cancelAnimationFrame(raf); window.clearTimeout(reenquadrar)
      window.removeEventListener('resize', enquadrar)
      descartaveis.forEach((o) => o.dispose())
      R.dispose()
      visibilidadeGlobo = 1
    },
  }
}
