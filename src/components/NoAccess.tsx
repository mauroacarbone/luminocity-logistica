import { Page, PageHeader } from './ui'

export function NoAccess() {
  return (
    <Page>
      <PageHeader title="No tenés acceso a esta sección" back={{ to: '/', label: 'Volver al inicio' }} />
    </Page>
  )
}
