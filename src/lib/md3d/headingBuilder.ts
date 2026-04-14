import * as THREE from 'three'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import type { BlogBlock } from '../blog/types'
import type { Block3DResult } from './types'
import {
  HEADING_CHAR_SIZE,
  HEADING_CHAR_SPACING,
  TEXT_DEPTH,
  MD3D_PALETTE,
} from './types'
import { createLineGroup, createAccentBar, wrapText, disposeGroup } from './textFactory'

/**
 * Heading → 3D landmark waypoint
 *
 * Large extruded text with an accent bar above and a subtle label below.
 * These are the prominent signposts in the 3D document landscape.
 */
export function buildHeading(block: BlogBlock, font: Font): Block3DResult {
  const group = new THREE.Group()
  group.name = `heading-${block.id}`

  const lines = wrapText(block.text, 36)

  // ── main title lines ────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = createLineGroup(lines[i], font, {
      size: HEADING_CHAR_SIZE,
      spacing: HEADING_CHAR_SPACING,
      depth: TEXT_DEPTH * 1.5,
      color: MD3D_PALETTE.heading,
      centerX: true,
    })
    line.position.y = -i * 0.5
    line.position.z = i * 0.06
    group.add(line)
  }

  // ── accent bar above ────────────────────────────────────────
  const titleWidth = Math.max(...lines.map(l => l.length)) * HEADING_CHAR_SPACING
  const bar = createAccentBar(titleWidth * 0.6, MD3D_PALETTE.headingAccent, 0.04, TEXT_DEPTH)
  bar.position.y = 0.35
  bar.position.z = -0.02
  group.add(bar)

  // ── soft secondary bar ──────────────────────────────────────
  const bar2 = createAccentBar(titleWidth * 0.25, MD3D_PALETTE.accentSecondary, 0.025, TEXT_DEPTH)
  bar2.position.y = 0.35
  bar2.position.x = titleWidth * 0.3 + 0.15
  bar2.position.z = -0.02
  ;(bar2.material as THREE.MeshStandardMaterial).opacity = 0.3
  ;(bar2.material as THREE.MeshStandardMaterial).transparent = true
  group.add(bar2)

  // ── label below ─────────────────────────────────────────────
  const label = createLineGroup(block.label.toUpperCase(), font, {
    size: 0.08,
    spacing: 0.065,
    depth: TEXT_DEPTH * 0.5,
    color: MD3D_PALETTE.bodySoft,
    centerX: true,
  })
  label.position.y = -lines.length * 0.5 - 0.15
  label.position.z = 0.02
  group.add(label)

  // ── compute bounds ──────────────────────────────────────────
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())

  return {
    group,
    boundingSize: size,
    dispose: () => disposeGroup(group),
  }
}
