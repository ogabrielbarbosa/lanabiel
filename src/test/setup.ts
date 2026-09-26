// Só o projeto `ui` carrega este arquivo, então aqui `document` sempre existe.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sem isto, a árvore montada por um teste sobrevive para o seguinte, e o
// `getByRole` passa a achar dois botões iguais — falha que parece do código.
afterEach(cleanup)
