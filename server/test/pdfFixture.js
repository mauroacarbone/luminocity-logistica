function pdfLiteral(text) {
  const raw = Buffer.from(text, 'latin1')
  const parts = [Buffer.from('(')]
  for (const byte of raw) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) parts.push(Buffer.from([0x5c, byte]))
    else parts.push(Buffer.from([byte]))
  }
  parts.push(Buffer.from(')'))
  return Buffer.concat(parts)
}

function contentStream(chunks) {
  const parts = [Buffer.from('BT\n/F1 10 Tf\n')]
  for (const chunk of chunks) {
    parts.push(Buffer.from(`1 0 0 1 ${chunk.x} ${chunk.y} Tm `))
    parts.push(pdfLiteral(chunk.text))
    parts.push(Buffer.from(' Tj\n'))
  }
  parts.push(Buffer.from('ET'))
  return Buffer.concat(parts)
}

export function buildTextPdf(pages) {
  const parts = []
  const offsets = [0]
  let cursor = 0
  function add(chunk) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    parts.push(buf)
    cursor += buf.length
  }
  function writeObj(id, body) {
    offsets[id] = cursor
    add(`${id} 0 obj\n`)
    add(body)
    add('\nendobj\n')
  }

  const fontId = 3
  const firstPageId = 4
  const pageObjId = (index) => firstPageId + index * 2
  const contentObjId = (index) => firstPageId + index * 2 + 1
  const kids = pages.map((_, index) => `${pageObjId(index)} 0 R`).join(' ')

  add('%PDF-1.4\n')
  writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  writeObj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  writeObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  pages.forEach((page, index) => {
    const stream = contentStream(page)
    const contentId = contentObjId(index)
    writeObj(
      pageObjId(index),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1191] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    )
    offsets[contentId] = cursor
    add(`${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n`)
    add(stream)
    add('\nendstream\nendobj\n')
  })

  const maxId = contentObjId(pages.length - 1)
  const xrefAt = cursor
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= maxId; id += 1) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  add(xref)
  add(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)
  return Buffer.concat(parts)
}

function text(x, y, value) {
  return { x, y, text: value }
}

export function exampleFcPdf() {
  return buildTextPdf([
    [
      text(40, 760, 'Luminocity SA'),
      text(360, 758, 'C.U.I.T. 30700000001'),
      text(40, 720, 'Factura N\u00BA 0006-00011284'),
      text(40, 680, 'Emsica S R L'),
      text(220, 679, 'Forma de Pago Contado Mixto'),
      text(40, 656, 'Blandengues 680 - Bahia Blanca (Buenos Aires)'),
      text(40, 632, 'IVA Responsable Inscripto - C.U.I.T. 33591090939'),
      text(40, 590, 'IT'),
      text(70, 589, 'Cant.'),
      text(130, 591, 'Detalle'),
      text(250, 590, 'P.Lista % Desc. % IVA P.Unit. Subtotal'),
      text(40, 540, '1'),
      text(70, 541, '10'),
      text(120, 539, '[VK-MIRROR-20W-CR-3000K-220V] (6291) - VK-MIRROR-20W-CR-3000K-220V'),
      text(520, 542, '72.110,74 -10,00 21,0 64.899,67 648.996,69'),
      text(40, 500, 'GRAVADO $ 648.996,69'),
    ],
  ])
}

export function dataUrlOf(buffer) {
  return `data:application/pdf;base64,${buffer.toString('base64')}`
}
