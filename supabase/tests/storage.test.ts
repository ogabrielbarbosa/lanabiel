// Critério A16 da spec — .agent/Tasks/fase-2-onboarding.md, seção 10.
// ADR: .agent/Decisions/0009-fotos-em-bucket-privado-por-casal.md
//
// Primeira policy em storage.objects do projeto. Mesma regra das tabelas: dois
// casais de verdade, e as duas direções — o parceiro lê, o de fora não.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, buildScenario, signIn } from './harness'
import type { Db, Scenario } from './harness'

let scene: Scenario
let asGabriel: Db
let asLana: Db
let asOutsider: Db

// 1×1 JPEG — o bucket só aceita webp e jpeg, e o conteúdo não importa aqui.
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  ),
  (c) => c.charCodeAt(0),
)

const paths: string[] = []

async function upload(db: Db, path: string) {
  return db.storage.from('avatars').upload(path, JPEG, { contentType: 'image/jpeg', upsert: true })
}

beforeAll(async () => {
  scene = await buildScenario('stg')
  asGabriel = await signIn(scene.gabriel.email)
  asLana = await signIn(scene.lana.email)
  asOutsider = await signIn(scene.outsider.email)
}, 60_000)

const mediaPaths: string[] = []

afterAll(async () => {
  if (paths.length > 0) await admin.storage.from('avatars').remove(paths)
  if (mediaPaths.length > 0) await admin.storage.from('couple-media').remove(mediaPaths)
})

describe('A16 — fotos por casal', () => {
  it('cada um grava na própria pasta', async () => {
    const path = `${scene.gabriel.id}/foto.jpg`
    const { error } = await upload(asGabriel, path)
    expect(error).toBeNull()
    paths.push(path)
  })

  it('ninguém grava na pasta de outro', async () => {
    const path = `${scene.lana.id}/intruso.jpg`
    const { error } = await upload(asGabriel, path)
    expect(error).not.toBeNull()
    paths.push(path) // se tivesse entrado, sai no afterAll
  })

  it('o parceiro lê; o de fora, não', async () => {
    const path = `${scene.gabriel.id}/foto.jpg`

    const partner = await asLana.storage.from('avatars').download(path)
    expect(partner.error).toBeNull()

    const outsider = await asOutsider.storage.from('avatars').download(path)
    expect(outsider.error).not.toBeNull()
    expect(outsider.data).toBeNull()
  })

  it('o de fora também não consegue URL assinada', async () => {
    const path = `${scene.gabriel.id}/foto.jpg`
    const { data, error } = await asOutsider.storage.from('avatars').createSignedUrl(path, 60)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('o bucket recusa tipo fora da lista', async () => {
    const path = `${scene.gabriel.id}/nota.txt`
    const { error } = await asGabriel.storage
      .from('avatars')
      .upload(path, new TextEncoder().encode('oi'), { contentType: 'text/plain' })
    expect(error).not.toBeNull()
    paths.push(path)
  })
})

// Critério A6 — .agent/Tasks/fase-3-configuracoes.md, seção 10.
// ADR: .agent/Decisions/0012-midia-do-casal-em-bucket-por-casal.md
describe('A6 — mídia do casal, pasta por casal', () => {
  const cover = () => `${scene.coupleA}/cover/${crypto.randomUUID()}.jpg`

  it('um integrante sobe, o outro lê', async () => {
    const path = cover()
    mediaPaths.push(path)
    const { error } = await asGabriel.storage.from('couple-media').upload(path, JPEG, { contentType: 'image/jpeg' })
    expect(error).toBeNull()
    const { data } = await asLana.storage.from('couple-media').download(path)
    expect(data).not.toBeNull()
  })

  it('o de fora não sobe na pasta do casal, nem lê', async () => {
    const path = cover()
    mediaPaths.push(path)
    const { error } = await asOutsider.storage.from('couple-media').upload(path, JPEG, { contentType: 'image/jpeg' })
    expect(error).not.toBeNull()
    await asGabriel.storage.from('couple-media').upload(path, JPEG, { contentType: 'image/jpeg', upsert: true })
    const { data } = await asOutsider.storage.from('couple-media').download(path)
    expect(data).toBeNull()
  })

  it('cover_path fora da pasta de capas do próprio casal é recusado', async () => {
    const { error } = await asGabriel
      .from('couples')
      .update({ cover_path: `${scene.coupleB}/cover/x.webp` })
      .eq('id', scene.coupleA)
    expect(error?.code).toBe('23514')
  })
})

// Critério A7 (lado do Storage) — .agent/Tasks/fase-4-lista.md, seção 10.
// As pastas `item/` (foto do item) e `memory/` (fotos do feito) da Lista não
// ganharam policy nova: as de `couple-media` já cortam pela primeira pasta.
// Isto prova que cortam também nelas. Só pastas dos casais `@test.local`.
describe('A7 (Fase 4) — fotos da Lista, na pasta do próprio casal', () => {
  const inFolder = (coupleId: string, kind: 'item' | 'memory') => `${coupleId}/${kind}/${crypto.randomUUID()}.webp`

  for (const kind of ['item', 'memory'] as const) {
    it(`${kind}/: sobe na pasta do próprio casal, e a outra pessoa lê`, async () => {
      const path = inFolder(scene.coupleA, kind)
      mediaPaths.push(path)
      const { error } = await asGabriel.storage.from('couple-media').upload(path, JPEG, { contentType: 'image/jpeg' })
      expect(error).toBeNull()
      const { data, error: readError } = await asLana.storage.from('couple-media').download(path)
      expect(readError).toBeNull()
      expect(data).not.toBeNull()
    })

    it(`${kind}/: ninguém sobe na pasta de outro casal`, async () => {
      const path = inFolder(scene.coupleB, kind)
      mediaPaths.push(path) // se tivesse entrado, sai no afterAll
      const { error } = await asGabriel.storage.from('couple-media').upload(path, JPEG, { contentType: 'image/jpeg' })
      expect(error).not.toBeNull()
    })
  }
})
