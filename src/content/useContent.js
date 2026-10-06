import { useContext } from 'react'
import { ContentContext } from './ContentContext'

export function useContent() {
  const content = useContext(ContentContext)
  if (!content) throw new Error('O conteúdo precisa estar dentro de ContentProvider.')
  return content
}
