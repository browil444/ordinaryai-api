import { Canvas, loadImage, FontLibrary } from 'skia-canvas'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const CONFIG = {
  rp:    { x: 70,  y: 62,  fontSize: 19,  color: '#a9e6ff' },
  saldo: { x: 101, y: 53,  fontSize: 29,  color: '#FFFFFF' },
  icon:  { gap: 8,  y: 64,  size: 20 },
}

async function loadFont(url, name) {
  const buf     = Buffer.from(await (await fetch(url)).arrayBuffer())
  const tmpPath = join(tmpdir(), `${name}-${Date.now()}.ttf`)
  writeFileSync(tmpPath, buf)
  FontLibrary.use(name, tmpPath)
  return tmpPath
}

async function generate(angka) {
  const tmp1 = await loadFont('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/iconfont.ttf', 'FontRp')
  const tmp2 = await loadFont('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/f5803c-1772975107907.ttf', 'FontSaldo')

  const bg      = await loadImage('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/_20260501192538912.jpg')
  const eyeIcon = await loadImage('https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/vision-off-svgrepo-com%20(1).svg')

  const canvas = new Canvas(bg.width, bg.height)
  const ctx    = canvas.getContext('2d')

  ctx.drawImage(bg, 0, 0)

  ctx.font         = `${CONFIG.rp.fontSize}px FontRp`
  ctx.fillStyle    = CONFIG.rp.color
  ctx.textBaseline = 'top'
  ctx.fillText('Rp', CONFIG.rp.x, CONFIG.rp.y)

  ctx.font         = `${CONFIG.saldo.fontSize}px FontSaldo`
  ctx.fillStyle    = CONFIG.saldo.color
  ctx.textBaseline = 'top'
  ctx.fillText(angka, CONFIG.saldo.x, CONFIG.saldo.y)

  const textWidth = ctx.measureText(angka).width
  const iconX     = CONFIG.saldo.x + textWidth + CONFIG.icon.gap

  ctx.save()
  ctx.filter = 'brightness(0) invert(1)'
  ctx.drawImage(eyeIcon, iconX, CONFIG.icon.y, CONFIG.icon.size, CONFIG.icon.size)
  ctx.restore()

  try { unlinkSync(tmp1) } catch {}
  try { unlinkSync(tmp2) } catch {}

  return await canvas.png
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // Ambil nominal dari query ?nominal=150000 atau body JSON
  const rawNominal =
    req.query?.nominal ||
    req.body?.nominal ||
    null

  if (!rawNominal) {
    return res.status(400).json({
      error: "Parameter 'nominal' wajib diisi.",
      contoh: '/api/fake-saldo-dana?nominal=150000',
    })
  }

  const raw = Number(String(rawNominal).replace(/\./g, '').replace(/,/g, ''))
  if (isNaN(raw) || raw < 0) {
    return res.status(400).json({ error: 'Nominal tidak valid. Contoh: 150000' })
  }

  const angka = raw.toLocaleString('id-ID')

  try {
    const buffer = await generate(angka)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Disposition', `inline; filename="dana_${raw}.png"`)
    return res.status(200).send(Buffer.from(buffer))
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Gagal generate gambar.' })
  }
}
