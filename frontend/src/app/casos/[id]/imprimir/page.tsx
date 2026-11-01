'use client'

import { Printer, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import CamadaMarcacoes from '../../../../components/detalhe/CamadaMarcacoes'
import Topbar from '../../../../components/Topbar'
import { apiJson, data, dataHora, urlFoto, type DetalheCaso } from '../../../../lib/casos'

// VERSAO PARA IMPRIMIR / SALVAR COMO PDF de uma pasta: ficha, cada
// radiografia com as marcacoes e anotacoes da versao atual e o aviso. A
// janela de impressao do navegador abre sozinha ("Salvar como PDF" esta
// nela).
export default function ImprimirPastaPage() {
  const t = useTranslations('Casos')
  const params = useParams<{ id: string }>()
  const [caso, setCaso] = useState<DetalheCaso | null>(null)
  const [erro, setErro] = useState('')
  const [carregadas, setCarregadas] = useState(0)

  useEffect(() => {
    apiJson<DetalheCaso>(`/casos/${params.id}`).then(setCaso).catch((e) => setErro((e as Error).message))
  }, [params.id])

  useEffect(() => {
    if (caso && carregadas >= caso.imagens.length) {
      const id = setTimeout(() => window.print(), 400)
      return () => clearTimeout(id)
    }
  }, [caso, carregadas])

  if (erro) return <p className="p-6 text-red-600">{erro}</p>
  if (!caso) return <p className="p-6">{t('carregando')}</p>
  return (
    <>
    <div className="print:hidden"><Topbar /></div>
    <main className="mx-auto max-w-4xl space-y-4 bg-white p-6 text-black">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{caso.paciente.nome}</h1>
          <p className="text-sm">{t('pasta', { id: caso.id })} · {data(caso.paciente.nascimento)} ({caso.paciente.idade} {t('anos')}) · {t(`generos.${caso.paciente.genero}`)} · {caso.paciente.contato}</p>
          <p className="text-sm">{t(`modalidades.${caso.modalidade}`)} · {t('enviadaPor', { aluno: caso.aluno ?? '—', quando: dataHora(caso.criado_em) })}</p>
        </div>
        <button type="button" onClick={() => window.print()} className="rounded border px-3 py-1 text-sm print:hidden"><Printer aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.imprimir')}</button>
      </div>
      <p className="rounded border border-amber-500 p-2 text-xs"><TriangleAlert aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('aviso')}</p>
      <p className="whitespace-pre-wrap text-sm"><b>{t('novo.descricao')}:</b> {caso.descricao}</p>
      {caso.revisao?.comentario && <p className="whitespace-pre-wrap text-sm"><b>{t('comentarioGeral')} ({caso.revisao.autor}, {t('versaoN', { n: caso.revisao.versao })}):</b> {caso.revisao.comentario}</p>}
      {caso.imagens.map((img, i) => {
        const a = caso.revisao?.anotacoes?.[String(img.id)]
        return (
          <section key={img.id} className="break-inside-avoid space-y-1 border-t pt-3">
            <div className="relative mx-auto w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFoto(caso.id, img.id)} alt="" className="max-h-[60vh] max-w-full" onLoad={() => setCarregadas((n) => n + 1)} onError={() => setCarregadas((n) => n + 1)} />
              {a && a.marcacoes.length > 0 && <div className="absolute inset-0"><CamadaMarcacoes marcacoes={a.marcacoes} /></div>}
            </div>
            <p className="text-sm"><b>{t('imagemDe', { n: i + 1, total: caso.imagens.length })}</b>{img.dentes.length ? ` · ${t('dentes')}: ${img.dentes.join(', ')}` : ''}</p>
            {img.observacao && <p className="text-sm">{t('doAluno')}: {img.observacao}</p>}
            {a?.texto && <p className="text-sm">{t('anotacaoDe', { autor: caso.revisao?.autor ?? '', versao: caso.revisao?.versao ?? 0 })}: {a.texto}</p>}
          </section>
        )
      })}
    </main>
    </>
  )
}
