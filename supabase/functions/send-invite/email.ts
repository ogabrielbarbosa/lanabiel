// O e-mail de convite — frame `E-mail de convite [YinSr]`, com a copy sem
// gênero da spec (seção 6).
//
// Sem import nenhum: é lido pelo Deno (a função) e pelo Node (o teste).
//
// Todo campo que vem do usuário passa por `escapeHtml`. O app manda e-mail
// para endereço arbitrário com texto escolhido por quem convida; sem escape,
// "nome do casal" vira HTML dentro de um e-mail com a nossa marca (spec, seção 9).

export interface InviteEmailData {
  code: string
  email: string
  invitee_name: string | null
  inviter_display_name: string
  inviter_full_name: string
  inviter_email: string | null
  couple_name: string | null
  expires_at: string
}

export interface RenderedEmail {
  to: string
  subject: string
  html: string
  text: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** `'2026-10-03T…'` → `'3 de outubro'`, no fuso do casal. */
export function validUntil(expiresAt: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(expiresAt))
}

/** O link leva o código no FRAGMENTO: não vai ao servidor nem ao Referer. */
export function inviteLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, '')}/#convite=${code}`
}

export function renderInviteEmail(data: InviteEmailData, appUrl: string): RenderedEmail {
  const inviter = data.inviter_display_name
  const space = data.couple_name ? `o espaço “${data.couple_name}”` : 'um espaço no lanabiel'
  const subjectSpace = data.couple_name ? `espaço ${data.couple_name}` : 'espaço de vocês'
  const greeting = data.invitee_name ? `Oi, ${data.invitee_name}!` : 'Oi!'
  const link = inviteLink(appUrl, data.code)
  const until = validUntil(data.expires_at)
  const sender = data.inviter_email
    ? `${data.inviter_full_name} (${data.inviter_email})`
    : data.inviter_full_name
  const blurb =
    'É onde vocês guardam os lugares que querem conhecer, as viagens e a contagem até o próximo encontro.'

  const subject = `${inviter} te convidou pro ${subjectSpace} 💌`

  const text = [
    greeting,
    '',
    `${inviter} te convidou para ${space}.`,
    blurb,
    '',
    `Aceitar convite: ${link}`,
    '',
    `Ou use o código no app: ${data.code.slice(0, 3)}-${data.code.slice(3)}`,
    `Válido até ${until}.`,
    '',
    `Você recebeu este e-mail porque ${sender} te convidou.`,
    'Não conhece essa pessoa? Pode ignorar este e-mail. Ninguém entra sem aceitar.',
  ].join('\n')

  const e = escapeHtml
  const box = (ch: string) =>
    `<td style="width:44px;height:52px;border:1px solid #3a3f55;border-radius:12px;background:#10152a;` +
    `text-align:center;font-size:26px;font-weight:600;color:#f4f6fb">${e(ch)}</td>`
  const boxes =
    [...data.code.slice(0, 3)].map(box).join('<td style="width:6px"></td>') +
    '<td style="width:18px;text-align:center;color:#8a8fa3">–</td>' +
    [...data.code.slice(3)].map(box).join('<td style="width:6px"></td>')

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#060a1c;font-family:Geist,-apple-system,'Segoe UI',Roboto,sans-serif;color:#f4f6fb">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060a1c;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td style="padding:0 0 24px;font-size:18px;font-weight:600;color:#f4f6fb">lanabiel</td></tr>
        <tr><td style="background:#0e1328;border:1px solid #2a2f45;border-radius:24px;padding:32px 28px">
          <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#b8bccb">${e(greeting)}</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:600;color:#f4f6fb">${e(inviter)} te convidou para ${e(space)}</h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.5;color:#b8bccb">${e(blurb)}</p>
          <a href="${e(link)}" style="display:inline-block;background:#7fd8c4;color:#08102a;text-decoration:none;font-size:16px;font-weight:600;padding:14px 28px;border-radius:999px">Aceitar convite</a>
          <p style="margin:12px 0 28px;font-size:12px;color:#8a8fa3">O botão já leva o código, não precisa digitar nada.</p>
          <p style="margin:0 0 12px;font-size:13px;color:#b8bccb">Ou use o código no app</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>${boxes}</tr></table>
          <p style="margin:12px 0 0;font-size:12px;color:#8a8fa3">Válido até ${e(until)}</p>
        </td></tr>
        <tr><td style="padding:24px 8px 0;font-size:11px;line-height:1.6;color:#8a8fa3">
          Você recebeu este e-mail porque ${e(sender)} te convidou.<br>
          Não conhece essa pessoa? Pode ignorar este e-mail. Ninguém entra sem aceitar.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { to: data.email, subject, html, text }
}
