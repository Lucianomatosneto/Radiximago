import Image from 'next/image'

// Ilustracao (imagem fornecida pelo usuario, gerada via v0 como referencia
// de design) de anatomia dental em estilo raio-X. Usada na tela de login.

export default function RadiografiaIlustrativa() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-base">
      <Image
        src="/assets/radiografia-panoramica.png"
        alt="Ilustração de anatomia dentária em raio-X"
        fill
        priority
        className="object-cover object-center"
        style={{ opacity: 0.65 }}
        sizes="100vw"
      />

      {/* janela de destaque: mais escuro em cima/embaixo, mais claro no meio */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(10,14,26,0.5) 0%, rgba(10,14,26,0.05) 28%, rgba(10,14,26,0.2) 52%, rgba(10,14,26,0.9) 88%, #0a0e1a 100%)',
        }}
      />
    </div>
  )
}
