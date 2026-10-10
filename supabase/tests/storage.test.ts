// Critério A16 da spec — .agent/Tasks/fase-2-onboarding.md, seção 10.
// ADR: .agent/Decisions/0009-fotos-em-bucket-privado-por-casal.md
//
// Primeira policy em storage.objects do projeto. Mesma regra das tabelas: dois
// casais de verdade, e as duas direções — o parceiro lê, o de fora não.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, buildScenario, signIn } from './harness'
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

  it('ninguém grava na pasta de quem é de outro casal', async () => {
    const path = `${scene.gabriel.id}/intruso.jpg`
    const { error } = await upload(asOutsider, path)
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

// ADR 0028 — trocar a foto da outra pessoa do casal. A foto sobe na pasta DELA
// (o CHECK `profiles_avatar_in_own_folder` não muda) e `set_partner_avatar`
// grava o caminho.
describe('ADR 0028 — a foto da outra pessoa', () => {
  const inFolder = (owner: string) => `${owner}/${crypto.randomUUID()}.jpg`

  async function setPartnerAvatar(db: Db, profileId: string, path: string) {
    const { data, error } = await db.rpc('set_partner_avatar', { p_profile_id: profileId, p_path: path })
    expect(error).toBeNull()
    return (data as { status: string }).status
  }

  it('quem divide casal sobe na pasta da outra pessoa, e a RPC grava no perfil dela', async () => {
    const path = inFolder(scene.lana.id)
    paths.push(path)
    expect((await upload(asGabriel, path)).error).toBeNull()

    expect(await setPartnerAvatar(asGabriel, scene.lana.id, path)).toBe('ok')
    const { data } = await admin.from('profiles').select('avatar_path').eq('id', scene.lana.id).single()
    expect(data?.avatar_path).toBe(path)

    // A dona da pasta lê a foto que a outra pessoa subiu.
    const own = await asLana.storage.from('avatars').download(path)
    expect(own.error).toBeNull()
  })

  it('não sobrescreve nem apaga o arquivo da outra pessoa', async () => {
    const path = inFolder(scene.lana.id)
    paths.push(path)
    expect((await upload(asLana, path)).error).toBeNull()

    // upsert = update na policy: só a dona.
    expect((await upload(asGabriel, path)).error).not.toBeNull()
    await asGabriel.storage.from('avatars').remove([path])
    const still = await admin.storage.from('avatars').download(path)
    expect(still.error).toBeNull()
  })

  it('a de quem é de outro casal: recusada', async () => {
    const path = inFolder(scene.outsider.id)
    paths.push(path)
    await admin.storage.from('avatars').upload(path, JPEG, { contentType: 'image/jpeg' })
    expect(await setPartnerAvatar(asGabriel, scene.outsider.id, path)).toBe('not_partner')
    const { data } = await admin.from('profiles').select('avatar_path').eq('id', scene.outsider.id).single()
    expect(data?.avatar_path).not.toBe(path)
  })

  it('a própria não passa pela RPC', async () => {
    const path = inFolder(scene.gabriel.id)
    paths.push(path)
    await upload(asGabriel, path)
    expect(await setPartnerAvatar(asGabriel, scene.gabriel.id, path)).toBe('not_partner')
  })

  it('caminho fora da pasta dela, ou arquivo que não existe: invalid', async () => {
    const mine = inFolder(scene.gabriel.id)
    paths.push(mine)
    await upload(asGabriel, mine)
    expect(await setPartnerAvatar(asGabriel, scene.lana.id, mine)).toBe('invalid')
    expect(await setPartnerAvatar(asGabriel, scene.lana.id, inFolder(scene.lana.id))).toBe('invalid')
  })

  it('anônimo não chama a RPC', async () => {
    const { error } = await anonClient().rpc('set_partner_avatar', {
      p_profile_id: scene.lana.id,
      p_path: inFolder(scene.lana.id),
    })
    expect(error).not.toBeNull()
  })
})
