/**
 * Reading a word list from a picture, in the browser. The picture never leaves the device: Tesseract.js runs as a
 * WebAssembly worker. Its script and the language models (about 4 MB per language) are downloaded from the jsDelivr CDN
 * on first use and kept in the browser's cache, so the library is loaded only when the dialog needs it.
 */
import type { Cell, OcrLine } from './wordList'

export type OcrLanguages = 'eng' | 'eng+ukr'

export interface OcrProgress {
  /** «load»: the library and the language models; «read»: the recognition itself. */
  stage: 'load' | 'read'
  /** 0 to 1 within the stage. */
  fraction: number
}

export interface Ocr {
  /**
   * Lines of cells from one picture. «block» keeps table rows on one line (the default); «auto» lets Tesseract split
   * the page into columns by itself and is the second try when the first one finds almost nothing.
   */
  read(image: Blob, layout?: 'block' | 'auto'): Promise<OcrLine[]>
  terminate(): Promise<void>
}

const MAX_SIDE = 2600
const MIN_SIDE = 1600

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    // Applies the orientation from the photo's metadata.
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * The picture made easy to read: scaled so the letters are neither tiny (a screenshot) nor huge (a phone photo),
 * grey, with the contrast stretched, and inverted when the text is light on a dark background (a dark theme).
 */
export async function prepareImage(file: Blob): Promise<HTMLCanvasElement> {
  const img = await decode(file)
  const longest = Math.max(img.width, img.height)
  const scale = longest < MIN_SIDE ? Math.min(3, MIN_SIDE / longest) : Math.min(1, MAX_SIDE / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Браузер не дає обробити картинку.')
  ctx.fillStyle = '#fff' // a transparent PNG would turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height)
  img.close()

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = data.data
  const grey = new Uint8ClampedArray(px.length / 4)
  const histogram = new Uint32Array(256)
  let sum = 0
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114)
    grey[j] = v
    histogram[v]++
    sum += v
  }
  const invert = sum / grey.length < 110
  const percentile = (share: number) => {
    let seen = 0
    for (let v = 0; v < 256; v++) {
      seen += histogram[v]
      if (seen >= grey.length * share) return v
    }
    return 255
  }
  const lo = percentile(0.02)
  const hi = Math.max(percentile(0.98), lo + 1)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    let v = ((grey[j] - lo) / (hi - lo)) * 255
    v = Math.min(255, Math.max(0, v))
    if (invert) v = 255 - v
    px[i] = px[i + 1] = px[i + 2] = v
    px[i + 3] = 255
  }
  ctx.putImageData(data, 0, 0)
  return canvas
}

interface RawWord {
  text: string
  confidence: number
  bbox: { x0: number; x1: number; y0: number; y1: number }
}

/** Words of a line that are far apart (more than a word height and a bit) are different columns of a table. */
export function cellsOf(words: RawWord[], gap: number): Cell[] {
  const sorted = [...words].filter((w) => w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0)
  const groups: RawWord[][] = []
  for (const w of sorted) {
    const group = groups.at(-1)
    if (group && w.bbox.x0 - group[group.length - 1].bbox.x1 <= gap) group.push(w)
    else groups.push([w])
  }
  return groups.map((g) => ({
    text: g.map((w) => w.text.trim()).join(' '),
    conf: g.reduce((n, w) => n + w.confidence, 0) / g.length,
  }))
}

export async function createOcr(langs: OcrLanguages, onProgress: (p: OcrProgress) => void): Promise<Ocr> {
  const { createWorker, PSM } = await import('tesseract.js')
  let worker
  try {
    worker = await createWorker(langs.split('+'), undefined, {
      logger: (m) => onProgress({ stage: m.status === 'recognizing text' ? 'read' : 'load', fraction: m.progress }),
    })
  } catch {
    throw new Error('Не вдалося завантажити модуль розпізнавання. При першому запуску потрібен інтернет (близько 5–10 МБ, далі це зберігається в браузері).')
  }
  // Spaces between columns stay wide, so the cells can be told apart.
  await worker.setParameters({ preserve_interword_spaces: '1' })

  return {
    async read(image, layout = 'block') {
      const canvas = await prepareImage(image)
      await worker.setParameters({ tessedit_pageseg_mode: layout === 'block' ? PSM.SINGLE_BLOCK : PSM.AUTO })
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
      canvas.width = canvas.height = 0 // frees the memory on phones at once

      const lines = data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) ?? []
      if (lines.length === 0) return data.text.split('\n').map((text) => [{ text, conf: data.confidence }])

      const heights = lines.flatMap((l) => l.words.map((w) => w.bbox.y1 - w.bbox.y0)).sort((a, b) => a - b)
      const gap = (heights[heights.length >> 1] ?? 20) * 1.3
      return lines.map((l) => cellsOf(l.words, gap))
    },
    terminate: async () => {
      await worker.terminate()
    },
  }
}
