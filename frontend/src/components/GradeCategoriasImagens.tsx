'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
    cor: 'from-emerald-100 to-emerald-50 border-emerald-300 text-emerald-700 dark:from-emerald-600/30 dark:to-emerald-900/10 dark:border-emerald-700/40 dark:text-emerald-300',
  },
  {
    titulo: 'Cárie',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'carie',
    cor: 'from-red-100 to-red-50 border-red-300 text-red-700 dark:from-red-600/30 dark:to-red-900/10 dark:border-red-700/40 dark:text-red-300',
  },
  {
    titulo: 'Lesões periapicais',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'lesao_periapical',
    cor: 'from-orange-100 to-orange-50 border-orange-300 text-orange-700 dark:from-orange-600/30 dark:to-orange-900/10 dark:border-orange-700/40 dark:text-orange-300',
  },
  {
    titulo: 'Perda óssea',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'perda_ossea',
    cor: 'from-amber-100 to-amber-50 border-amber-300 text-amber-700 dark:from-amber-600/30 dark:to-amber-900/10 dark:border-amber-700/40 dark:text-amber-300',
  },
  {
    titulo: 'Dentes inclusos',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'dente_incluso',
    cor: 'from-purple-100 to-purple-50 border-purple-300 text-purple-700 dark:from-purple-600/30 dark:to-purple-900/10 dark:border-purple-700/40 dark:text-purple-300',
  },
  {
    titulo: 'Tratamento endodôntico',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'tratamento_endodontico',
    cor: 'from-blue-100 to-blue-50 border-blue-300 text-blue-700 dark:from-blue-600/30 dark:to-blue-900/10 dark:border-blue-700/40 dark:text-blue-300',
  },
  {
    titulo: 'Erros técnicos',
    rotuloParametro: 'Achado principal',
    parametro: 'achado_principal',
    valor: 'erro_tecnico',
    cor: 'from-slate-100 to-slate-50 border-slate-300 text-ink-2 dark:from-slate-600/30 dark:to-slate-900/10 dark:border-slate-700/40 dark:text-slate-300',
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
