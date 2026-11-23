'use client'

// FICHA EM CARTOES (panoramica, 23/11/2026): os cartoes tem altura fixa e
// nao rolam, entao o item aceso NAO pode crescer (o "zoom" do holofote das
// outras telas o faria passar da borda). Este contexto avisa as caixas da
// ficha (Secao, Item dos dados) que estao dentro de um cartao.
import { createContext, useContext } from 'react'

export const FichaCompactaContext = createContext(false)

export function useFichaCompacta(): boolean {
  return useContext(FichaCompactaContext)
}
