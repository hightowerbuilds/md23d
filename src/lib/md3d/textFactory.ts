import * as THREE from 'three'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import {
  TEXT_DEPTH,
  BODY_CHAR_SIZE,
  BODY_CHAR_SPACING,
  LINE_Y_STEP,
  LINE_Z_STEP,
  LINE_WRAP_CHARS,
  MD3D_PALETTE,
} from './types'

// ── geometry cache ───────────────────────────────────────────────
// Reuse geometry for repeated characters at the same size to cut draw calls

const geoCache = new Map<string, THREE.BufferGeometry>()

function charCacheKey(char: string, size: number, depth: number): string {
  return `${char}|${size}|${depth}`
}

export function clearGeoCache() {
  for (const g of geoCache.values()) g.dispose()
  geoCache.clear()
}

// ── single character mesh ────────────────────────────────────────

export function createCharMesh(
  char: string,
  font: Font,
  size = BODY_CHAR_SIZE,
  depth = TEXT_DEPTH,
  color = MD3D_PALETTE.body,
): THREE.Mesh {
  const key = charCacheKey(char, size, depth)
  let geom = geoCache.get(key)

  if (!geom) {
    geom = new TextGeometry(char, {
      font,
      size,
      depth,
      curveSegments: 3,
      bevelEnabled: false,
    })
    geom.computeBoundingBox()
    geom.center()
    geoCache.set(key, geom)
  }

  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.6,
    emissive: color,
    emissiveIntensity: MD3D_PALETTE.emissive,
  })

  const mesh = new THREE.Mesh(geom, mat)
  mesh.userData = { char }
  return mesh
}

// ── single line of 3D characters ─────────────────────────────────

export function createLineGroup(
  text: string,
  font: Font,
  opts?: {
    size?: number
    spacing?: number
    depth?: number
    color?: number
    centerX?: boolean
  },
): THREE.Group {
  const size = opts?.size ?? BODY_CHAR_SIZE
  const spacing = opts?.spacing ?? BODY_CHAR_SPACING
  const color = opts?.color ?? MD3D_PALETTE.body
  const depth = opts?.depth ?? TEXT_DEPTH
  const centerX = opts?.centerX ?? true

  const group = new THREE.Group()
  const totalW = text.length * spacing
  const startX = centerX ? -totalW / 2 + spacing / 2 : 0

  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue
    const ch = createCharMesh(text[i], font, size, depth, color)
    ch.position.x = startX + i * spacing
    ch.userData.charIndex = i
    group.add(ch)
  }

  group.userData = { text }
  return group
}

// ── word-wrap a string into lines ────────────────────────────────

export function wrapText(text: string, maxChars = LINE_WRAP_CHARS): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (!word) continue
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}

// ── multi-line text block (lines staggered in Z) ─────────────────

export function createTextBlock(
  text: string,
  font: Font,
  opts?: {
    size?: number
    spacing?: number
    depth?: number
    color?: number
    lineHeight?: number
    lineZStep?: number
    maxChars?: number
    centerX?: boolean
  },
): THREE.Group {
  const lineHeight = opts?.lineHeight ?? LINE_Y_STEP
  const lineZStep = opts?.lineZStep ?? LINE_Z_STEP
  const maxChars = opts?.maxChars ?? LINE_WRAP_CHARS

  const lines = wrapText(text, maxChars)
  const group = new THREE.Group()

  for (let i = 0; i < lines.length; i++) {
    const lineGroup = createLineGroup(lines[i], font, {
      size: opts?.size,
      spacing: opts?.spacing,
      depth: opts?.depth,
      color: opts?.color,
      centerX: opts?.centerX ?? false,
    })
    lineGroup.position.y = -i * lineHeight
    lineGroup.position.z = i * lineZStep // each line steps forward in Z
    group.add(lineGroup)
  }

  group.userData = { lineCount: lines.length }
  return group
}

// ── accent bar (horizontal 3D bar) ───────────────────────────────

export function createAccentBar(
  width: number,
  color = MD3D_PALETTE.accent,
  height = 0.035,
  depth = TEXT_DEPTH,
): THREE.Mesh {
  const geom = new THREE.BoxGeometry(width, height, depth)
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.25,
    metalness: 0.2,
    roughness: 0.7,
  })
  return new THREE.Mesh(geom, mat)
}

// ── wireframe enclosure ──────────────────────────────────────────

export function createEnclosure(
  width: number,
  height: number,
  depth: number,
  color = MD3D_PALETTE.frameSoft,
  fillAlpha = 0.06,
): THREE.Group {
  const group = new THREE.Group()
  const box = new THREE.BoxGeometry(width, height, depth)

  const edgeMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
  })
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMat))

  if (fillAlpha > 0) {
    const fillMat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: fillAlpha,
      side: THREE.DoubleSide,
      metalness: 0.05,
      roughness: 0.9,
    })
    group.add(new THREE.Mesh(box, fillMat))
  }

  return group
}

// ── dispose helper ───────────────────────────────────────────────

export function disposeGroup(group: THREE.Group) {
  group.traverse((obj: any) => {
    if (obj.geometry && !geoCache.has(obj.userData?.char)) {
      obj.geometry.dispose()
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) m.dispose()
    }
  })
}
