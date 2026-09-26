/**
 * Resultado discriminado. `rows` só existe no caso `ok`, de propósito: é o que
 * impede o consumidor de confundir "lista vazia legítima" com "sem sessão" e
 * com "falha de rede".
 *
 * Isso não é zelo abstrato. Com RLS, sessão ausente devolve ZERO LINHAS, não
 * erro — e o projeto no free tier pausa por inatividade, devolvendo falha de
 * rede. Uma função que devolvesse `T[]` e `[]` nos dois casos ruins faria o app
 * abrir mostrando um calendário limpo, e o casal concluir que perdeu a
 * história. Ver seção 7 da spec da Fase 0.
 */
export type DataResult<T> =
  | { status: 'ok'; rows: T }
  | { status: 'unauthenticated' }
  | { status: 'error'; cause: string }

export type WriteResult<T> =
  | { status: 'ok'; row: T }
  | { status: 'unauthenticated' }
  /** Uma pessoa não está em dois lugares no mesmo dia — `stays_no_overlap`. */
  | { status: 'overlapping_stay' }
  | { status: 'error'; cause: string }
