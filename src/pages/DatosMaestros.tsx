import { useState, type FormEvent } from 'react'
import { Page, PageHeader } from '../components/ui'
import { normalizeTimeWindow } from '../lib/slot'
import { useCatalog } from '../state/CatalogContext'

function itemKey(value: string) {
  return value.trim().toLocaleLowerCase('es-AR')
}

function nameError(value: string, others: readonly string[], normalize?: (value: string) => string) {
  const cleaned = normalize ? normalize(value) : value.trim()
  if (!cleaned) return 'No puede quedar vacío.'
  const key = itemKey(cleaned)
  if (others.some((item) => itemKey(normalize ? normalize(item) : item) === key)) {
    return 'Ese valor ya existe.'
  }
  return ''
}

function StringList({
  title,
  hint,
  placeholder,
  empty,
  items,
  onSave,
  normalize,
}: {
  title: string
  hint: string
  placeholder: string
  empty: string
  items: string[]
  onSave: (next: string[]) => boolean
  normalize?: (value: string) => string
}) {
  const [draft, setDraft] = useState('')
  const [addError, setAddError] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editError, setEditError] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)
  const [saveError, setSaveError] = useState('')

  function persist(next: string[]) {
    if (!onSave(next)) {
      setSaveError('No se pudo guardar en este navegador.')
      return false
    }
    setSaveError('')
    return true
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const error = nameError(draft, items, normalize)
    if (error) {
      setAddError(error)
      return
    }
    const cleaned = normalize ? normalize(draft) : draft.trim()
    if (!persist([...items, cleaned])) return
    setDraft('')
    setAddError('')
  }

  function startEdit(index: number) {
    setEditing(index)
    setEditDraft(items[index] ?? '')
    setEditError('')
    setConfirming(null)
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (editing === null) return
    const error = nameError(
      editDraft,
      items.filter((_, index) => index !== editing),
      normalize,
    )
    if (error) {
      setEditError(error)
      return
    }
    const cleaned = normalize ? normalize(editDraft) : editDraft.trim()
    const next = items.map((item, index) => (index === editing ? cleaned : item))
    if (!persist(next)) return
    setEditing(null)
    setEditDraft('')
    setEditError('')
  }

  function remove(index: number) {
    if (!persist(items.filter((_, itemIndex) => itemIndex !== index))) return
    setConfirming(null)
    if (editing === index) {
      setEditing(null)
      setEditDraft('')
      setEditError('')
    } else if (editing !== null && editing > index) {
      setEditing(editing - 1)
    }
  }

  return (
    <section className="form-card master-card">
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      {items.length === 0 ? (
        <p className="hint master-empty">{empty}</p>
      ) : (
        <ul className="master-list">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              {editing === index ? (
                <form onSubmit={saveEdit}>
                  <div className="master-row">
                    <label className="field">
                      <input
                        value={editDraft}
                        aria-label={`Editar ${title}`}
                        onChange={(event) => {
                          setEditDraft(event.target.value)
                          setEditError('')
                        }}
                      />
                    </label>
                    <button type="submit" className="btn-primary">
                      Guardar
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setEditing(null)
                        setEditError('')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                  {editError && <small className="field-error">{editError}</small>}
                </form>
              ) : (
                <div className="master-row">
                  <span>{item}</span>
                  {confirming === index ? (
                    <span className="master-confirm">
                      <span>¿Eliminar?</span>
                      <button
                        type="button"
                        className="rounded-xl bg-danger-deep px-3 py-2 text-sm font-semibold text-inverse hover:bg-danger"
                        onClick={() => remove(index)}
                      >
                        Sí
                      </button>
                      <button type="button" className="text-button" onClick={() => setConfirming(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <span className="master-actions">
                      <button type="button" className="text-button" onClick={() => startEdit(index)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-danger-deep px-3 py-2 text-sm font-semibold text-inverse hover:bg-danger"
                        onClick={() => {
                          setConfirming(index)
                          setEditing(null)
                        }}
                      >
                        Eliminar
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="master-add" onSubmit={add}>
        <label className="field">
          <input
            value={draft}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(event) => {
              setDraft(event.target.value)
              setAddError('')
            }}
          />
          {addError && <small className="field-error">{addError}</small>}
        </label>
        <button type="submit" className="btn-primary">
          Agregar
        </button>
      </form>
      {saveError && <small className="field-error">{saveError}</small>}
    </section>
  )
}

function ZoneList({
  zones,
  onSave,
}: {
  zones: { name: string; days: string }[]
  onSave: (next: { name: string; days: string }[]) => boolean
}) {
  const [name, setName] = useState('')
  const [days, setDays] = useState('')
  const [addError, setAddError] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDays, setEditDays] = useState('')
  const [editError, setEditError] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)
  const [saveError, setSaveError] = useState('')

  function persist(next: { name: string; days: string }[]) {
    if (!onSave(next)) {
      setSaveError('No se pudo guardar en este navegador.')
      return false
    }
    setSaveError('')
    return true
  }

  function zoneError(nextName: string, nextDays: string, others: readonly { name: string }[]) {
    const label = nameError(
      nextName,
      others.map((zone) => zone.name),
    )
    if (label) return label
    if (!nextDays.trim()) return 'Indicá los días de reparto.'
    return ''
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const error = zoneError(name, days, zones)
    if (error) {
      setAddError(error)
      return
    }
    if (!persist([...zones, { name: name.trim(), days: days.trim() }])) return
    setName('')
    setDays('')
    setAddError('')
  }

  function startEdit(index: number) {
    const zone = zones[index]
    if (!zone) return
    setEditing(index)
    setEditName(zone.name)
    setEditDays(zone.days)
    setEditError('')
    setConfirming(null)
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (editing === null) return
    const error = zoneError(
      editName,
      editDays,
      zones.filter((_, index) => index !== editing),
    )
    if (error) {
      setEditError(error)
      return
    }
    const next = zones.map((zone, index) =>
      index === editing ? { name: editName.trim(), days: editDays.trim() } : zone,
    )
    if (!persist(next)) return
    setEditing(null)
    setEditError('')
  }

  function remove(index: number) {
    if (!persist(zones.filter((_, itemIndex) => itemIndex !== index))) return
    setConfirming(null)
    if (editing === index) {
      setEditing(null)
      setEditError('')
    } else if (editing !== null && editing > index) {
      setEditing(editing - 1)
    }
  }

  return (
    <section className="form-card master-card">
      <h2>Zonas de entrega</h2>
      <p className="hint">
        Nombre y días de reparto. Nuevo Pedido usa estos días en el aviso de fecha.
      </p>
      {zones.length === 0 ? (
        <p className="hint master-empty">Todavía no hay zonas de entrega.</p>
      ) : (
        <ul className="master-list">
          {zones.map((zone, index) => (
            <li key={`${zone.name}-${index}`}>
              {editing === index ? (
                <form onSubmit={saveEdit}>
                  <div className="master-row">
                    <label className="field">
                      <input
                        value={editName}
                        aria-label="Nombre de la zona"
                        onChange={(event) => {
                          setEditName(event.target.value)
                          setEditError('')
                        }}
                      />
                    </label>
                    <label className="field">
                      <input
                        value={editDays}
                        aria-label="Días de reparto"
                        placeholder="Lun · Jue"
                        onChange={(event) => {
                          setEditDays(event.target.value)
                          setEditError('')
                        }}
                      />
                    </label>
                    <button type="submit" className="btn-primary">
                      Guardar
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setEditing(null)
                        setEditError('')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                  {editError && <small className="field-error">{editError}</small>}
                </form>
              ) : (
                <div className="master-row">
                  <span className="master-zone-label">
                    <strong>{zone.name}</strong>
                    <span className="hint">{zone.days}</span>
                  </span>
                  {confirming === index ? (
                    <span className="master-confirm">
                      <span>¿Eliminar?</span>
                      <button
                        type="button"
                        className="rounded-xl bg-danger-deep px-3 py-2 text-sm font-semibold text-inverse hover:bg-danger"
                        onClick={() => remove(index)}
                      >
                        Sí
                      </button>
                      <button type="button" className="text-button" onClick={() => setConfirming(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <span className="master-actions">
                      <button type="button" className="text-button" onClick={() => startEdit(index)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-danger-deep px-3 py-2 text-sm font-semibold text-inverse hover:bg-danger"
                        onClick={() => {
                          setConfirming(index)
                          setEditing(null)
                        }}
                      >
                        Eliminar
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="master-add" onSubmit={add}>
        <label className="field">
          <input
            value={name}
            placeholder="Nombre de la zona"
            aria-label="Nombre de la zona"
            onChange={(event) => {
              setName(event.target.value)
              setAddError('')
            }}
          />
        </label>
        <label className="field">
          <input
            value={days}
            placeholder="Días, ej. Lun · Jue"
            aria-label="Días de reparto"
            onChange={(event) => {
              setDays(event.target.value)
              setAddError('')
            }}
          />
        </label>
        <button type="submit" className="btn-primary">
          Agregar
        </button>
      </form>
      {addError && <small className="field-error">{addError}</small>}
      {saveError && <small className="field-error">{saveError}</small>}
    </section>
  )
}

export function DatosMaestros() {
  const { sellers, ownTransporters, courierTransporters, zones, propertyTypes, timeWindows, save } =
    useCatalog()

  return (
    <Page>
      <PageHeader
        title="Datos maestros"
        subtitle="Listas que usan los formularios de pedidos, despacho y post venta."
      />
      <div className="form-stack">
        <StringList
          title="Vendedores"
          hint="Aparecen en Nuevo Pedido y Post Venta."
          placeholder="Nuevo vendedor"
          empty="Todavía no hay vendedores."
          items={sellers}
          onSave={(next) => save({ sellers: next })}
        />
        <StringList
          title="Entrega propia"
          hint="Transportistas de Nuevo Pedido cuando el tipo es Entrega propia. También entran al filtro de Despacho."
          placeholder="Nuevo transportista propio"
          empty="Todavía no hay transportistas de entrega propia."
          items={ownTransporters}
          onSave={(next) => save({ ownTransporters: next })}
        />
        <StringList
          title="Correo / Courier"
          hint="Transportistas de Nuevo Pedido cuando el tipo es Correo / Courier. También entran al filtro de Despacho."
          placeholder="Nuevo correo o courier"
          empty="Todavía no hay correos o couriers."
          items={courierTransporters}
          onSave={(next) => save({ courierTransporters: next })}
        />
        <ZoneList zones={zones} onSave={(next) => save({ zones: next })} />
        <StringList
          title="Tipos de propiedad"
          hint="Opciones del formulario de Nuevo Pedido."
          placeholder="Nuevo tipo"
          empty="Todavía no hay tipos de propiedad."
          items={propertyTypes}
          onSave={(next) => save({ propertyTypes: next })}
        />
        <StringList
          title="Franjas horarias"
          hint="Opciones del formulario de Nuevo Pedido."
          placeholder="Ej. 10:00-15:00"
          empty="Todavía no hay franjas horarias."
          items={timeWindows}
          normalize={normalizeTimeWindow}
          onSave={(next) => save({ timeWindows: next.map((item) => normalizeTimeWindow(item)).filter(Boolean) })}
        />
      </div>
    </Page>
  )
}
