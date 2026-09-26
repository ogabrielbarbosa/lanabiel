import type { Stay } from './types'

/**
 * Histórico real de vocês, carregado automaticamente na primeira vez que o
 * app abre neste navegador. Depois disso vira dado normal — editável e
 * removível como qualquer outro registro.
 */
export const SEED_STAYS: Stay[] = [
  { id: 'seed-1', person: 'gabriel', start: '2026-07-15', end: '2026-07-31', city: 'Londrina' },
  { id: 'seed-2', person: 'lana', start: '2026-07-15', end: '2026-07-31', city: 'Londrina' },
  { id: 'seed-3', person: 'gabriel', start: '2026-08-01', end: '2026-08-17', city: 'São José dos Campos' },
  { id: 'seed-4', person: 'lana', start: '2026-08-01', end: '2026-08-10', city: 'São José dos Campos' },
  { id: 'seed-5', person: 'lana', start: '2026-08-11', end: '2026-08-29', city: 'Marau' },
  { id: 'seed-6', person: 'gabriel', start: '2026-08-18', end: '2026-08-29', city: 'Marau' },
  { id: 'seed-7', person: 'gabriel', start: '2026-08-30', end: '2026-09-11', city: 'São José dos Campos' },
  { id: 'seed-8', person: 'lana', start: '2026-08-30', end: '2026-09-11', city: 'São José dos Campos' },
  { id: 'seed-9', person: 'gabriel', start: '2026-09-12', end: '2026-09-21', city: 'Marau' },
  { id: 'seed-10', person: 'lana', start: '2026-09-12', city: 'Marau' },
  { id: 'seed-11', person: 'gabriel', start: '2026-09-22', city: 'São José dos Campos' },
]
