'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CORES_ACHADO_PRINCIPAL } from '../lib/coresAchados'

interface Categoria {
  titulo: string
  rotuloParametro: string
  parametro: 'tipo_radiografia' | 'achado_principal' | 'qualidade_tecnica'
  valor: string
  cor: string
}

// Categorias do banco de imagens - cada card leva pra pesquisa avancada ja
// filtrada. Compartilhado entre a tela "Banco de imagens" e o dashboard
// (perfis nao-administradores veem essa grade como tela inicial).
const CATEGORIAS: Categoria[] = [
  {
    titulo: 'Periapicais',
    rotuloParametro: 'Tipo de radiografia',
    parametro: 'tipo_radiografia',
    valor: 'periapical',
    cor: 'from-teal-100 to-teal-50 border-teal-300 text-teal-700 dark:from-teal-600/30 dark:to-teal-900/10 dark:border-teal-700/40 dark:text-teal-300',
  },
  {
    titulo: 'Panorâmicas',
    rotuloParametro: 'Tipo de radiografia',
    parametro: 'tipo_radiografia',
    valor: 'panoramica',
    cor: 'from-teal-100 to-teal-50 border-teal-300 text-teal-700 dark:from-teal-600/30 dark:to-teal-900/10 dark:border-teal-700/40 dark:text-teal-300',
  },
  {
    titulo: 'Interproximais',
    rotuloParametro: 'Tipo de radiografia',
    parametro: 'tipo_radiografia',
    valor: 'interproximal',
    cor: 'from-teal-100 to-teal-50 border-teal-300 text-teal-700 dark:from-teal-600/30 dark:to-teal-900/10 dark:border-teal-700/40 dark:text-teal-300',
  },
  {
    titulo: 'Oclusais',
    rotuloParametro: 'Tipo de radiografia',
    parametro: 'tipo_radiografia',
    valor: 'oclusal',
    cor: 'from-teal-100 to-teal-50 border-teal-300 text-teal-700 dark:from-teal-600/30 dark:to-teal-900/10 dark:border-teal-700/40 dark:text-teal-300',
  },
  {
    titulo: 'Anatomia normal',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'normal',
    cor: CORES_ACHADO_PRINCIPAL.normal.cartao,
  },
  {
    titulo: 'Cárie',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'carie',
    cor: CORES_ACHADO_PRINCIPAL.carie.cartao,
  },
  {
    titulo: 'Lesões periapicais',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'lesao_periapical',
    cor: CORES_ACHADO_PRINCIPAL.lesao_periapical.cartao,
  },
  {
    titulo: 'Perda óssea',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'perda_ossea',
    cor: CORES_ACHADO_PRINCIPAL.perda_ossea.cartao,
  },
  {
    titulo: 'Dentes inclusos',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'dente_incluso',
    cor: CORES_ACHADO_PRINCIPAL.dente_incluso.cartao,
  },
  {
    titulo: 'Tratamento endodôntico',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'tratamento_endodontico',
    cor: CORES_ACHADO_PRINCIPAL.tratamento_endodontico.cartao,
  },
  {
    titulo: 'Erros técnicos',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'erro_tecnico',
    cor: CORES_ACHADO_PRINCIPAL.erro_tecnico.cartao,
  },
  {
    titulo: 'Imagens de alta qualidade didática',
    rotuloParametro: 'Qualidade técnica',
    parametro: 'qualidade_tecnica',
    valor: 'otima',
    cor: 'from-yellow-100 to-yellow-50 border-yellow-400 text-yellow-700 dark:from-yellow-500/30 dark:to-yellow-900/10 dark:border-yellow-600/40 dark:text-yellow-300',
  },
]

interface Contagens {
  total: number
  por_tipo_radiografia: Record<string, number>
  por_achado_principal: Record<string, number>
  por_qualidade_tecnica: Record<string, number>
}

const MAPA_CONTAGEM: Record<Categoria['parametro'], keyof Contagens> = {
  tipo_radiografia: 'por_tipo_radiografia',
  achado_principal: 'por_achado_principal',
  qualidade_tecnica: 'por_qualidade_tecnica',
}

export default function GradeCategoriasImagens() {
  const [contagens, setContagens] = useState<Contagens | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/counts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados) => {
        if (dados) setContagens(dados)
      })
      .catch(() => {
        // sem contagem, os cards continuam funcionando normalmente sem o numero
      })
  }, [])

  function contagemDaCategoria(categoria: Categoria): number | null {
    if (!contagens) return null
    const grupo = contagens[MAPA_CONTAGEM[categoria.parametro]] as Record<string, number>
    return grupo?.[categoria.valor] ?? 0
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-400">
        {contagens ? (
          <>
            <span className="font-semibold text-slate-200">{contagens.total}</span>{' '}
            {contagens.total === 1 ? 'imagem disponível no total' : 'imagens disponíveis no total'}
          </>
        ) : (
          'Carregando total de imagens disponíveis...'
        )}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CATEGORIAS.map((categoria) => {
          const contagem = contagemDaCategoria(categoria)
          return (
            <Link
              key={`${categoria.parametro}-${categoria.valor}`}
              href={`/pesquisa?${categoria.parametro}=${categoria.valor}`}
              className={`group flex h-40 flex-col justify-between rounded-xl border bg-gradient-to-br p-5 transition-transform hover:-translate-y-0.5 hover:shadow-lg ${categoria.cor}`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs uppercase tracking-wide opacity-70">{categoria.rotuloParametro}</span>
                {contagem !== null && (
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold">{contagem}</span>
                )}
              </div>
              <span className="text-lg font-semibold text-slate-100">{categoria.titulo}</span>
              <span className="text-sm opacity-80 group-hover:opacity-100">Ver imagens →</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
