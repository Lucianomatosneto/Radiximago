import Image from 'next/image'

type VarianteLogo = 'navbar' | 'sidebar' | 'login' | 'hero' | 'footer'

interface LogoProps {
  /** Contexto de uso - cada um tem a altura definida na identidade visual
   * do RÁDIX IMAGO (ver classes .logo--* em globals.css, com o tamanho
   * mobile automático entre 40-60px embutido via media query). */
  variante: VarianteLogo
  className?: string
}

const CLASSE_POR_VARIANTE: Record<VarianteLogo, string> = {
  navbar: 'logo--navbar',
  sidebar: 'logo--sidebar',
  login: 'logo--login',
  hero: 'logo--hero',
  footer: 'logo--footer',
}

// Dimensoes reais do arquivo fonte (public/assets/logo-radix-imago.png) -
// usadas pelo Next/Image so pra calcular a proporcao correta; o tamanho
// exibido de fato vem da classe .logo--* (width: auto, object-fit: contain
// - nunca distorce, nunca corta). Fundo branco original removido via
// flood-fill (so o que estava conectado a borda), preservando os detalhes
// internos brancos da arte (divisores da roda, letras "O" etc).
const LARGURA_ORIGINAL = 1063
const ALTURA_ORIGINAL = 1037

export default function Logo({ variante, className = '' }: LogoProps) {
  return (
    <Image
      src="/assets/logo-radix-imago.png"
      alt="RÁDIX IMAGO"
      aria-label="RÁDIX IMAGO"
      width={LARGURA_ORIGINAL}
      height={ALTURA_ORIGINAL}
      priority
      loading="eager"
      decoding="async"
      className={`animar-logo-entrada w-auto object-contain ${CLASSE_POR_VARIANTE[variante]} ${className}`}
    />
  )
}
