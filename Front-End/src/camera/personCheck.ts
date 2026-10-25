// Decides, on the device, whether the crosshair was on a person (MediaPipe's
// DeepLab v3 segmenter labels every pixel; one class is "person") and whether it
// was on their head (MediaPipe's pose landmarker finds nose, eyes, ears, shoulders;
// MediaPipe's hair segmenter, run on a close-up of each head, finds the hair).
import { ImageSegmenter, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

const SEGMENT_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite'
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const HAIR_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite'

/** Side of the square we zoom into around the crosshair, as a fraction of the photo's short side. */
const ZOOM = 0.6
/** Highlight color for detected people in the hit photo. */
const TINT = [34, 197, 94, 110]  // green, semi-transparent
/** Outline color for detected heads, and tint for detected hair. */
const HEAD_COLOR = '#facc15'
const HAIR_TINT = [250, 204, 21, 120]  // yellow, semi-transparent
/** The close-up of a head is this many head zones wide, so the hair model sees all the hair. */
const HAIR_CROP = 1.6

export interface PersonCheck {
  /** The pixel at the very center of the crosshair is on a person (or it's a headshot). */
  hit: boolean
  /** A hit whose crosshair was inside someone's head. */
  headshot: boolean
  /** The hit photo with detected people (and heads) highlighted, as a JPEG data URL. */
  highlighted: string
}

const fileset = { wasmLoaderPath, wasmBinaryPath }
let segmenter: Promise<ImageSegmenter> | null = null
let poser: Promise<PoseLandmarker> | null = null
let hairSegmenter: Promise<ImageSegmenter> | null = null

function loadHairSegmenter() {
  hairSegmenter ??= ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAIR_MODEL, delegate: 'CPU' },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  }).catch((err) => {
    hairSegmenter = null
    throw err
  })
  return hairSegmenter
}

function loadSegmenter() {
  segmenter ??= ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate: 'CPU' },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  }).catch((err) => {
    segmenter = null  // let the next shot try again
    throw err
  })
  return segmenter
}

function loadPoser() {
  poser ??= PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'CPU' },
    runningMode: 'IMAGE',
    numPoses: 6,
  }).catch((err) => {
    poser = null
    throw err
  })
  return poser
}

/** Start downloading the models early (~2.7 + 5.8 + 0.8 MB, cached after the first time). */
export function preloadPersonCheck() {
  return Promise.all([loadSegmenter(), loadPoser().catch(() => null), loadHairSegmenter().catch(() => null)])
}

/** Hair found in a close-up of one head: a mask over a square of the photo. */
interface HairPatch { x: number; y: number; size: number; mask: Uint8Array; width: number; height: number; hair: number }

/**
 * Runs the hair model on a close-up of `head` (the model is made for selfie-like
 * close-ups, so we zoom in until the head fills the frame).
 */
function findHair(model: ImageSegmenter, img: HTMLImageElement, head: Head): HairPatch {
  const size = Math.max(head.rx, head.ry) * 2 * HAIR_CROP
  const x = head.cx - size / 2, y = head.cy - size / 2
  const close = document.createElement('canvas')
  close.width = close.height = 512
  close.getContext('2d')!.drawImage(img, x, y, size, size, 0, 0, 512, 512)
  const result = model.segment(close)
  try {
    const mask = result.categoryMask!
    const index = model.getLabels().indexOf('hair')
    return { x, y, size, mask: mask.getAsUint8Array().slice(), width: mask.width, height: mask.height, hair: index >= 0 ? index : 1 }
  } finally {
    result.close()
  }
}

/** Is there hair at (or within a hair's breadth of) a photo point? */
function hairAt(p: HairPatch, px: number, py: number) {
  const u = ((px - p.x) / p.size) * p.width, v = ((py - p.y) / p.size) * p.height
  const r = p.width * 0.015
  for (let y = Math.max(0, Math.floor(v - r)); y <= Math.min(p.height - 1, Math.ceil(v + r)); y++) {
    for (let x = Math.max(0, Math.floor(u - r)); x <= Math.min(p.width - 1, Math.ceil(u + r)); x++) {
      if ((x - u) ** 2 + (y - v) ** 2 <= r * r && p.mask[y * p.width + x] === p.hair) return true
    }
  }
  return false
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the photo.'))
    img.src = src
  })
}

/**
 * A head zone in photo pixels: an ellipse big enough to include hair, and (when
 * shoulders are visible) a neck line below which a shot isn't a headshot.
 */
interface Head { cx: number; cy: number; rx: number; ry: number; neckY?: number }

/** How much the head ellipse is grown to take in hair. */
const HAIR = 1.35
/**
 * Slack at the edge of a head, as a fraction of head size: a headshot needs the
 * person outline within this distance of the crosshair (the outline cuts off hair).
 */
const HEAD_EDGE = 0.25

/**
 * Head zone from pose landmarks (0 nose, 2/5 eyes, 7/8 ears, 11/12 shoulders),
 * given as normalized coordinates inside a box of the photo (x, y, w, h).
 * Works from the front (pairs of eyes/ears) and from the side (one ear and eye):
 * in profile the ear is about the middle of the head, while from the front the face
 * points sit low on the head, so the zone is shifted up to cover the top of the skull.
 */
function headFrom(pose: NormalizedLandmark[], box: { x: number; y: number; w: number; h: number }): Head | null {
  const px = (i: number) => ({ x: box.x + pose[i].x * box.w, y: box.y + pose[i].y * box.h, seen: pose[i].visibility > 0.3 })
  const face = [0, 2, 5, 7, 8].map(px).filter((p) => p.seen)
  if (face.length < 2) return null
  const dist = (a: number, b: number) => (px(a).seen && px(b).seen ? Math.hypot(px(a).x - px(b).x, px(a).y - px(b).y) : 0)
  // Several size estimates; take the largest the visible points support.
  const size = Math.max(
    dist(7, 8) * 0.65,                          // ear to ear (front)
    dist(2, 5) * 1.5,                           // eye to eye (front)
    dist(11, 12) * 0.3,                         // shoulder width
    Math.max(dist(7, 0), dist(8, 0)) * 0.9,     // ear to nose (side)
    Math.max(dist(7, 2), dist(8, 5)) * 1.3,     // ear to eye (side)
  )
  if (!size) return null

  // Seen from the side: only one ear is visible. Center on it, nudged toward the face.
  const ears = [px(7), px(8)].filter((p) => p.seen)
  const nose = px(0)
  let cx: number, cy: number
  if (ears.length === 1) {
    cx = ears[0].x + (nose.seen ? (nose.x - ears[0].x) * 0.15 : 0)
    cy = ears[0].y - size * 0.35
  } else {
    cx = face.reduce((s, p) => s + p.x, 0) / face.length
    cy = face.reduce((s, p) => s + p.y, 0) / face.length - size * 0.3
  }

  // Neck line: comfortably above the shoulders, so neck and shoulder shots don't count.
  const shoulders = [px(11), px(12)].filter((p) => p.seen)
  const neckY = shoulders.length
    ? shoulders.reduce((s, p) => s + p.y, 0) / shoulders.length - size * 0.35
    : undefined
  return { cx, cy, rx: size * HAIR, ry: size * 1.3 * HAIR, neckY }
}

function detectHeads(model: PoseLandmarker, source: HTMLImageElement | HTMLCanvasElement,
  box: { x: number; y: number; w: number; h: number }): Head[] {
  const result = model.detect(source)
  try {
    return result.landmarks.map((pose) => headFrom(pose, box)).filter((h): h is Head => h !== null)
  } finally {
    result.close()
  }
}

/**
 * Heads found in the full photo, plus any from the zoomed crop (better for far-away
 * people). With only a torso in view the crop pass can imagine a face on someone's
 * chest, so a crop head is dropped when the full photo already found a real head
 * close by (that's the same person).
 */
function findHeads(model: PoseLandmarker, img: HTMLImageElement, crop: HTMLCanvasElement,
  cropBox: { x: number; y: number; w: number; h: number }): Head[] {
  const full = detectHeads(model, img, { x: 0, y: 0, w: img.width, h: img.height })
  const zoomed = detectHeads(model, crop, cropBox).filter((z) =>
    !full.some((f) => Math.hypot(z.cx - f.cx, z.cy - f.cy) < 4 * Math.max(z.rx, f.rx)))
  return [...full, ...zoomed]
}

/** Is the center of `photo` (a data URL; the crosshair is always at the center) on a person, and on their head? */
export async function checkPerson(photo: string): Promise<PersonCheck> {
  const [[model, posing, hairModel], img] = await Promise.all([preloadPersonCheck(), loadImage(photo)])
  const short = Math.min(img.width, img.height)

  // Zoom into a square around the crosshair, so far-away people still get enough
  // pixels for the models to recognize them.
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

    // Body: hit only if the single pixel at the very center of the crosshair is on a person.
    const centerOnPerson = labels[Math.floor(mh / 2) * mw + Math.floor(mw / 2)] === person

    /** Is any person pixel within `r` mask pixels of the crosshair? */
    const personWithin = (r: number) => {
      for (let y = Math.max(0, Math.floor(mh / 2 - r)); y <= Math.min(mh - 1, Math.ceil(mh / 2 + r)); y++) {
        for (let x = Math.max(0, Math.floor(mw / 2 - r)); x <= Math.min(mw - 1, Math.ceil(mw / 2 + r)); x++) {
          if ((x - mw / 2) ** 2 + (y - mh / 2) ** 2 <= r * r && labels[y * mw + x] === person) return true
        }
      }
      return false
    }

    // Headshot: the crosshair (photo center) inside a head zone (hair included, cut at
    // the neck). The person outline is rough around hair, so for heads it's enough
    // that the outline is close by (within HEAD_EDGE of a head-width), not exactly
    // under the crosshair. Without the pose model there are no headshots; hit / miss
    // still works.
    const heads = posing ? findHeads(posing, img, crop, { x: left, y: top, w: side, h: side }) : []
    const aimX = img.width / 2, aimY = img.height / 2
    const aboveNeck = (h: Head) => h.neckY === undefined || aimY <= h.neckY
    const inZone = heads.some((h) =>
      ((aimX - h.cx) / h.rx) ** 2 + ((aimY - h.cy) / h.ry) ** 2 <= 1 && aboveNeck(h) &&
      (centerOnPerson || personWithin((HEAD_EDGE * h.rx / HAIR) * (mw / side))))

    // Hair, however big: run the hair model on close-ups of the heads near the
    // crosshair, and count the shot if the crosshair is on that hair (above the neck).
    const nearby = heads.filter((h) =>
      Math.abs(aimX - h.cx) <= Math.max(h.rx, h.ry) * HAIR_CROP && Math.abs(aimY - h.cy) <= Math.max(h.rx, h.ry) * HAIR_CROP)
    const hair = hairModel ? nearby.map((h) => ({ head: h, patch: findHair(hairModel, img, h) })) : []
    const onHair = hair.some(({ head, patch }) => aboveNeck(head) && hairAt(patch, aimX, aimY))

    const headshot = inZone || onHair
    const hit = centerOnPerson || headshot

    // Paint detected people (and heads) onto the photo so the player can see what counted.
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
    for (const { patch } of hair) {
      const hairTint = document.createElement('canvas')
      hairTint.width = patch.width
      hairTint.height = patch.height
      const hp = new ImageData(patch.width, patch.height)
      patch.mask.forEach((label, i) => { if (label === patch.hair) hp.data.set(HAIR_TINT, i * 4) })
      hairTint.getContext('2d')!.putImageData(hp, 0, 0)
      ctx.drawImage(hairTint, patch.x, patch.y, patch.size, patch.size)
    }
    ctx.strokeStyle = HEAD_COLOR
    ctx.lineWidth = Math.max(2, short / 200)
    // Outline exactly what counts as a headshot: the hair-inclusive ellipse, cut at the neck.
    for (const h of heads) {
      ctx.save()
      if (h.neckY !== undefined) {
        ctx.beginPath()
        ctx.rect(0, 0, img.width, h.neckY)
        ctx.clip()
      }
      ctx.beginPath()
      ctx.ellipse(h.cx, h.cy, h.rx, h.ry, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    return { hit, headshot, highlighted: out.toDataURL('image/jpeg', 0.85) }
  } finally {
    result.close()
  }
}
