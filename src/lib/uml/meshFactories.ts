import * as THREE from 'three'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import type { NodeShape, EdgeStyle } from './types'

// ── shared constants ─────────────────────────────────────────────

export const CHAR_SIZE = 0.18
export const CHAR_DEPTH = 0.04
export const CHAR_SPACING = 0.14
const CURVE_SEGS = 3

// colors
const COL_FRAME = 0x78daff
const COL_TEXT = 0xeaf4ff
const COL_EDGE = 0x4a7aaa
const COL_ARROW = 0x78daff
const COL_LABEL = 0xa8d8ff

// ── single character mesh ────────────────────────────────────────

export function createCharMesh(
  char: string,
  font: Font,
  size = CHAR_SIZE,
  depth = CHAR_DEPTH,
  color = COL_TEXT,
): THREE.Mesh {
  const geom = new TextGeometry(char, {
    font,
    size,
    depth,
    curveSegments: CURVE_SEGS,
    bevelEnabled: false,
  })
  geom.computeBoundingBox()
  geom.center()

  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.6,
    emissive: color,
    emissiveIntensity: 0.15,
  })

  const mesh = new THREE.Mesh(geom, mat)
  mesh.userData = { char }
  return mesh
}

// ── label (group of character meshes) ────────────────────────────

export function createLabel(
  text: string,
  font: Font,
  opts?: { size?: number; depth?: number; color?: number; spacing?: number },
): THREE.Group {
  const size = opts?.size ?? CHAR_SIZE
  const spacing = opts?.spacing ?? CHAR_SPACING
  const color = opts?.color ?? COL_TEXT
  const depth = opts?.depth ?? CHAR_DEPTH

  const group = new THREE.Group()
  const totalW = text.length * spacing
  const startX = -totalW / 2 + spacing / 2

  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue
    const ch = createCharMesh(text[i], font, size, depth, color)
    ch.position.x = startX + i * spacing
    ch.userData.charIndex = i
    group.add(ch)
  }

  group.userData = { label: text }
  return group
}

// ── node frame (wireframe box / diamond / sphere) ────────────────

export function createNodeFrame(
  shape: NodeShape,
  w: number,
  h: number,
  color = COL_FRAME,
  fillAlpha = 0.18,
): THREE.Group {
  const group = new THREE.Group()
  const d = CHAR_DEPTH * 2

  const edgeMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
  })
  const fillMat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: fillAlpha,
    side: THREE.DoubleSide,
    metalness: 0.1,
    roughness: 0.8,
  })

  switch (shape) {
    case 'rect':
    case 'rounded':
    case 'asymmetric': {
      const box = new THREE.BoxGeometry(w, h, d)
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMat))
      group.add(new THREE.Mesh(box, fillMat))
      break
    }
    case 'diamond': {
      const s = Math.max(w, h) * 0.75
      const box = new THREE.BoxGeometry(s, s, d)
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMat)
      wire.rotation.z = Math.PI / 4
      const fill = new THREE.Mesh(box, fillMat)
      fill.rotation.z = Math.PI / 4
      group.add(wire, fill)
      break
    }
    case 'circle': {
      const r = Math.max(w, h) / 2
      const sphere = new THREE.SphereGeometry(r, 16, 12)
      group.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(sphere),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }),
        ),
      )
      group.add(
        new THREE.Mesh(
          sphere,
          new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: fillAlpha * 0.5,
            metalness: 0.2,
            roughness: 0.6,
          }),
        ),
      )
      break
    }
  }

  return group
}

// ── edge line + arrow head ───────────────────────────────────────

export function createEdge(
  from: THREE.Vector3,
  to: THREE.Vector3,
  style: EdgeStyle,
): THREE.Group {
  const group = new THREE.Group()
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  if (len < 0.01) return group

  const unit = dir.clone().normalize()
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
  const up = new THREE.Vector3(0, 1, 0)

  if (style === 'dotted') {
    // individual dash segments floating in space
    const dashLen = 0.1
    const gap = 0.08
    const step = dashLen + gap
    const count = Math.floor(len / step)
    const dashMat = new THREE.MeshStandardMaterial({
      color: COL_EDGE,
      emissive: COL_EDGE,
      emissiveIntensity: 0.2,
    })

    for (let i = 0; i < count; i++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, dashLen, 4),
        dashMat,
      )
      const p = from
        .clone()
        .add(unit.clone().multiplyScalar(i * step + dashLen / 2))
      seg.position.copy(p)
      seg.quaternion.setFromUnitVectors(up, unit)
      group.add(seg)
    }
  } else {
    const radius = style === 'thick' ? 0.025 : 0.012
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, len, 6),
      new THREE.MeshStandardMaterial({
        color: COL_EDGE,
        emissive: COL_EDGE,
        emissiveIntensity: 0.2,
        metalness: 0.2,
        roughness: 0.7,
      }),
    )
    tube.position.copy(mid)
    tube.quaternion.setFromUnitVectors(up, unit)
    group.add(tube)
  }

  // arrow tip
  if (style !== 'line') {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.15, 6),
      new THREE.MeshStandardMaterial({
        color: COL_ARROW,
        emissive: COL_ARROW,
        emissiveIntensity: 0.3,
      }),
    )
    cone.position.copy(to)
    cone.quaternion.setFromUnitVectors(up, unit)
    group.add(cone)
  }

  return group
}

// ── edge label ───────────────────────────────────────────────────

export function createEdgeLabel(
  text: string,
  pos: THREE.Vector3,
  font: Font,
): THREE.Group {
  const g = createLabel(text, font, {
    size: CHAR_SIZE * 0.65,
    spacing: CHAR_SPACING * 0.65,
    color: COL_LABEL,
  })
  g.position.copy(pos)
  g.position.z += 0.08
  return g
}
