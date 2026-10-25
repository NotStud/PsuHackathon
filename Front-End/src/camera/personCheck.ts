// Decides whether the crosshair was on a person, on the device, with MediaPipe's
// DeepLab v3 segmenter (it labels every pixel; one of its classes is "person").
import { ImageSegmenter } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite'

/** Side of the square we zoom into around the crosshair, as a fraction of the photo's short side. */
const ZOOM = 0.6
/** Radius of the "on target" zone around the aim point, as a fraction of the photo's short side. */
const AIM_RADIUS = 0.02
/**
 * Share of the aim zone that must be on a person to count as a hit. Kept low so a
 * shot that grazes someone counts; the model is least sure at edges and on hands.
 */
const HIT_COVERAGE = 0.1
/** Highlight color for detected people in the hit photo. */
const TINT = [34, 197, 94, 110]  // green, semi-transparent

export interface PersonCheck {
  hit: boolean
  /** Fraction (0–1) of the aim zone that was on a person. */
  coverage: number
  /** The hit photo with detected people highlighted, as a JPEG data URL. */
  highlighted: string
}

let segmenter: Promise<ImageSegmenter> | null = null

/** Start downloading the model early (it's ~2.7 MB, cached after the first time). */
export function preloadPersonCheck() {
  segmenter ??= ImageSegmenter.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  }).catch((err) => {
    segmenter = null  // let the next shot try again
    throw err
  })
  return segmenter
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the photo.'))
    img.src = src
  })
}

/** Is the center of `photo` (a data URL; the crosshair is always at the center) on a person? */
export async function checkPerson(photo: string): Promise<PersonCheck> {
  const [model, img] = await Promise.all([preloadPersonCheck(), loadImage(photo)])
  const short = Math.min(img.width, img.height)

  // Zoom into a square around the crosshair, so far-away people still get enough
  // pixels for the model to recognize them.
  const side = Math.round(short * ZOOM)
  const left = Math.round((img.width - side) / 2)
  const top = Math.round((img.height - side) / 2)
  const crop = document.createElement('canvas')
  crop.width = crop.height = 512
  crop.getContext('2d')!.drawImage(img, left, top, side, side, 0, 0, 512, 512)

  const result = model.segment(crop)
  try {
    const mask = result.categoryMask!
    const labels = mask.getAsUint8Array()
    const person = model.getLabels().indexOf('person')
    const { width: mw, height: mh } = mask

    // Share of the aim zone (a small circle at the crop's center) that is a person.
    const r = (AIM_RADIUS / ZOOM) * mw
    let inZone = 0, onPerson = 0
    for (let y = Math.floor(mh / 2 - r); y <= Math.ceil(mh / 2 + r); y++) {
      for (let x = Math.floor(mw / 2 - r); x <= Math.ceil(mw / 2 + r); x++) {
        if ((x - mw / 2) ** 2 + (y - mh / 2) ** 2 > r * r) continue
        inZone++
        if (labels[y * mw + x] === person) onPerson++
      }
    }
    const coverage = inZone ? onPerson / inZone : 0

    // Paint detected people onto the photo so the player can see what counted.
    const tint = document.createElement('canvas')
    tint.width = mw
    tint.height = mh
    const pixels = new ImageData(mw, mh)
    labels.forEach((label, i) => { if (label === person) pixels.data.set(TINT, i * 4) })
    tint.getContext('2d')!.putImageData(pixels, 0, 0)
    const out = document.createElement('canvas')
    out.width = img.width
    out.height = img.height
    const ctx = out.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    ctx.drawImage(tint, left, top, side, side)

    return { hit: coverage >= HIT_COVERAGE, coverage, highlighted: out.toDataURL('image/jpeg', 0.85) }
  } finally {
    result.close()
  }
}
