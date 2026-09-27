// O modal pedido em `modal` do contexto (T10 período, T11 evento), dentro da
// `CalendarScreen`. Salvar → `reload()` → fecha (R25, ADR 0015): o modal fica
// desabilitado até a releitura voltar, e a tela nova já traz o que foi gravado.

import { useCalendar } from './context'
import { EventModal } from './EventModal'
import { PeriodModal } from './PeriodModal'

export function CalendarModals() {
  const c = useCalendar()
  const { modal, closeModal, reload } = c
  if (!modal) return null

  async function saved() {
    await reload()
    closeModal()
  }

  switch (modal.kind) {
    case 'newPeriod':
      return <PeriodModal key={`np-${modal.day}`} env={c} mode={{ kind: 'new', day: modal.day }} onClose={closeModal} onSaved={saved} />
    case 'editPeriod':
      return (
        <PeriodModal key={`ep-${modal.run.from}`} env={c} mode={{ kind: 'edit', run: modal.run }} onClose={closeModal} onSaved={saved} />
      )
    case 'newEvent':
      return (
        <EventModal
          key={`ne-${modal.day}`}
          env={c}
          mode={{ kind: 'new', day: modal.day, preset: modal.preset }}
          onClose={closeModal}
          onSaved={saved}
        />
      )
    case 'editEvent':
      return <EventModal key={`ee-${modal.event.id}`} env={c} mode={{ kind: 'edit', event: modal.event }} onClose={closeModal} onSaved={saved} />
  }
}
