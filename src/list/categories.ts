// Ícone de cada categoria da Lista, como nos chips do frame `B3rwp`. A cor é o
// token `--cat-{categoria}` (list.css, claro e escuro), não um hex aqui.

import { Building2, Clapperboard, Globe, Soup, Sparkles, Trees, Tv, Utensils } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ListCategory } from '../domain/list'

export const CATEGORY_ICONS: Record<ListCategory, LucideIcon> = {
  pais: Globe,
  cidade: Building2,
  restaurante: Utensils,
  parque: Trees,
  comida: Soup,
  experiencia: Sparkles,
  filme: Clapperboard,
  serie: Tv,
}

/** A classe que liga `--cat` à cor da categoria (list.css). */
export function catClass(category: ListCategory): string {
  return `ls-cat--${category}`
}
