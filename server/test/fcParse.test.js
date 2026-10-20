import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PDF_DATA_PREFIX, PDF_MAX_BYTES } from '../src/pdfAttachment.js'
import { parseFcPdf } from '../src/fcParse.js'
import { buildTextPdf, dataUrlOf } from './pdfFixture.js'

const fixturePath = fileURLToPath(new URL('./fixtures/fc-ejemplo.pdf', import.meta.url))

function line(x, y, text) {
  return { x, y, text }
}

function tablePage(rows) {
  const chunks = [
    line(40, 760, 'Luminocity SA'),
    line(360, 758, 'C.U.I.T. 30700000001'),
    line(40, 700, 'Factura No 0001-00000001'),
    line(40, 660, 'Cliente SA'),
    line(200, 659, 'Forma de Pago Contado'),
    line(40, 640, 'IVA Responsable Inscripto - C.U.I.T. 20111111112'),
    line(40, 600, 'IT'),
    line(80, 599, 'Cant.'),
    line(140, 601, 'Detalle'),
  ]
  rows.forEach((row, index) => {
    chunks.push(line(40, 560 - index * 24, row))
  })
  chunks.push(line(40, 40, 'GRAVADO $ 1,00'))
  return chunks
}

function table(rows) {
  return buildTextPdf([tablePage(rows)])
}

test('lee la FC de ejemplo', async () => {
  const file = await readFile(fixturePath)
  const parsed = await parseFcPdf(dataUrlOf(file))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.factura, '0006-00011284')
  assert.equal(parsed.cliente, 'Emsica S R L')
  assert.deepEqual(parsed.items, [
    {
      it: 1,
      code: 'VK-MIRROR-20W-CR-3000K-220V',
      internalCode: '6291',
      description: 'VK-MIRROR-20W-CR-3000K-220V',
      quantity: 10,
    },
  ])
  assert.deepEqual(parsed.warnings, [])
})

test('junta una descripción partida y una cantidad con ceros', async () => {
  const pdf = table([
    '1 2 [ABC-1] (99) - Lampara 10,00 20,00',
    'de techo led',
    '2 10,00 [ZERO] (15) - Rollo 10,00 20,00',
  ])
  const parsed = await parseFcPdf(dataUrlOf(pdf))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.items.length, 2)
  assert.equal(parsed.items[0].description, 'Lampara de techo led')
  assert.equal(parsed.items[0].quantity, 2)
  assert.equal(parsed.items[1].code, 'ZERO')
  assert.equal(parsed.items[1].quantity, 10)
})

test('deja afuera la cantidad con decimales', async () => {
  const pdf = table(['1 2,50 [METRO] (8) - Cinta 10,00 20,00'])
  const parsed = await parseFcPdf(dataUrlOf(pdf))
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.items, [])
  assert.deepEqual(parsed.warnings, ['Renglón 1: cantidad con decimales, cargala a mano'])
})

test('suma el mismo código', async () => {
  const pdf = table([
    '1 4 [ABC-1] (99) - Lampara 10,00 20,00',
    '2 6 [ABC-1] (99) - Lampara 10,00 20,00',
  ])
  const parsed = await parseFcPdf(dataUrlOf(pdf))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].it, 1)
  assert.equal(parsed.items[0].quantity, 10)
  assert.equal(parsed.items[0].internalCode, '99')
})

test('ignora renglones fuera de la tabla de cada página', async () => {
  const page = (rows, extras = []) => {
    const chunks = [
      ...extras,
      line(40, 600, 'IT Cant. Detalle'),
      ...rows.map((row, index) => line(40, 560 - index * 20, row)),
      line(40, 80, 'GRAVADO $ 1,00'),
    ]
    return chunks
  }
  const pdf = buildTextPdf([
    page(['1 1 [UNO] (1) - Primero 10,00 10,00']),
    page(['2 3 [DOS] (2) - Segundo 10,00 10,00'], [line(40, 700, '1 9 [NO] (9) - Afuera 10,00 10,00')]),
  ])
  const parsed = await parseFcPdf(dataUrlOf(pdf))
  assert.equal(parsed.ok, true)
  assert.deepEqual(
    parsed.items.map((item) => item.code),
    ['UNO', 'DOS'],
  )
  assert.equal(parsed.items[1].quantity, 3)
})

test('rechaza más de 100 artículos', async () => {
  const pages = []
  for (let start = 0; start < 101; start += 20) {
    const rows = []
    for (let index = start; index < Math.min(start + 20, 101); index += 1) {
      const n = index + 1
      rows.push(`${n} 1 [COD-${n}] (1) - Item ${n} 10,00 10,00`)
    }
    pages.push(tablePage(rows))
  }
  const parsed = await parseFcPdf(dataUrlOf(buildTextPdf(pages)))
  assert.deepEqual(parsed, { ok: false, reason: 'La FC tiene más de 100 artículos.' })
})

test('distingue PDF inválido, sin texto y con otro formato', async () => {
  const invalid = await parseFcPdf('data:text/plain;base64,SGk=')
  assert.deepEqual(invalid, { ok: false, reason: 'El adjunto tiene que ser un PDF.' })

  const broken = await parseFcPdf(`${PDF_DATA_PREFIX}@@@`)
  assert.deepEqual(broken, { ok: false, reason: 'El adjunto tiene que ser un PDF.' })

  const huge = await parseFcPdf(dataUrlOf(Buffer.alloc(PDF_MAX_BYTES + 1, 0x25)))
  assert.deepEqual(huge, { ok: false, reason: 'El archivo supera los 2 MB.' })

  const empty = await parseFcPdf(dataUrlOf(buildTextPdf([[]])))
  assert.deepEqual(empty, {
    ok: false,
    reason: 'La FC no tiene texto para leer (parece escaneada). Cargá los artículos a mano.',
  })

  const other = await parseFcPdf(dataUrlOf(buildTextPdf([[line(40, 700, 'Presupuesto sin tabla')]])))
  assert.deepEqual(other, {
    ok: false,
    reason: 'No reconocimos el formato de la FC. Tiene que ser una factura de Cianbox.',
  })
})
