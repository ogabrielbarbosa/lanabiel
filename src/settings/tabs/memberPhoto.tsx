// Trocar a foto de um integrante — a própria ou a da outra pessoa (ADR 0028).
//
// A foto mora sempre na pasta de quem aparece nela. A própria é gravada pela
// policy `profiles_update_self`; a da outra pessoa, pela RPC
// `set_partner_avatar`, que confere que vocês dividem casal.

import { useRef } from 'react'
import { Camera } from 'lucide-react'
import type { SettingsMember } from '../../data/settings'
import { Button, FieldError } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'

const photoKey = (profileId: string) => `avatar:${profileId}`

/** O erro da última troca de foto deste integrante. */
export function PhotoError({ ctx, member }: { ctx: TabContext; member: SettingsMember }) {
  return <FieldError message={ctx.writes.error(photoKey(member.profileId))} />
}

function useMemberPhoto(ctx: TabContext, member: SettingsMember) {
  const { api, writes, update, me } = ctx
  const key = photoKey(member.profileId)
  const isMe = member.profileId === me.profileId

  async function save(path: string): Promise<string | null> {
    if (isMe) {
      const saved = await api.updateProfile({ avatarPath: path })
      if (saved.status === 'invalid') return saved.cause
      // `color_taken` não vem de trocar a foto; o tipo só não sabe disso.
      if (saved.status === 'color_taken') return 'Não deu pra salvar a foto.'
      return saved.status === 'ok' ? null : failureMessage(saved)
    }
    const saved = await api.setPartnerAvatar(member.profileId, path)
    switch (saved.status) {
      case 'ok':
        return null
      case 'not_member':
        return 'Você não está mais neste espaço.'
      case 'not_partner':
        ctx.reload()
        return `${member.displayName} não está mais neste espaço.`
      case 'invalid':
        return 'A foto não chegou a subir. Tente de novo.'
      default:
        return failureMessage(saved)
    }
  }

  async function upload(file: File) {
    await writes.run(key, async () => {
      const prepared = await api.prepareAvatar(file)
      if (prepared.status === 'not_image') return 'Esse arquivo não é uma imagem.'
      if (prepared.status === 'too_large') return 'A foto é grande demais (até 10 MB).'
      const uploaded = await api.uploadAvatar(prepared, isMe ? undefined : member.profileId)
      if (uploaded.status !== 'ok') return failureMessage(uploaded)
      const error = await save(uploaded.path)
      if (error) return error
      update((d) => ({
        ...d,
        couple: {
          ...d.couple,
          members: d.couple.members.map((m) =>
            m.profileId === member.profileId ? { ...m, avatarPath: uploaded.path } : m,
          ),
        },
      }))
      ctx.refreshUrls()
      return null
    })
  }

  return { upload, pending: writes.pending(key) }
}

/** O botão "Trocar foto" com o seletor de arquivo escondido. O erro, quem chama mostra. */
export function PhotoButton({ ctx, member }: { ctx: TabContext; member: SettingsMember }) {
  const input = useRef<HTMLInputElement>(null)
  const photo = useMemberPhoto(ctx, member)
  const isMe = member.profileId === ctx.me.profileId
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label={isMe ? 'Sua foto' : `Foto de ${member.displayName}`}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void photo.upload(file)
        }}
      />
      <Button icon={Camera} onClick={() => input.current?.click()} disabled={photo.pending}>
        {photo.pending ? 'Enviando…' : 'Trocar foto'}
      </Button>
    </>
  )
}
