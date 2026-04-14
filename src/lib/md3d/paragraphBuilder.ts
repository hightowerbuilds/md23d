import * as THREE from 'three'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import type { BlogBlock } from '../blog/types'
import type { Block3DResult } from './types'
import {
  BODY_CHAR_SIZE,
  BODY_CHAR_SPACING,
  LINE_Y_STEP,
  LINE_Z_STEP,
  LINE_WRAP_CHARS,
  MD3D_PALETTE,
} from './types'
import { createTextBlock, createLineGroup, disposeGroup } from './textFactory'

/**
 * Paragraph → 3D text with Z-depth
 *
 * Each line of text is its own row of character meshes.
 * Lines stagger forward in Z so the paragraph has physical depth
 * when viewed from the side — a wall of text you can orbit around.
 */
export function buildParagraph(block: BlogBlock, font: Font): Block3DResult {
  const group = new THREE.Group()
  group.name = `paragraph-${block.id}`

  // ── label ───────────────────────────────────────────────────
  const label = createLineGroup(block.label.toUpperCase(), font, {
    size: 0.07,
    spacing: 0.058,
    depth: 0.015,
    color: MD3D_PALETTE.bodySoft,
    centerX: false,
  })
  label.position.y = 0.18
  group.add(label)

  // ── body text block ─────────────────────────────────────────
  const textBlock = createTextBlock(block.text, font, {
    size: BODY_CHAR_SIZE,
    spacing: BODY_CHAR_SPACING,
    color: MD3D_PALETTE.body,
    lineHeight: LINE_Y_STEP,
    lineZStep: LINE_Z_STEP,
    maxChars: LINE_WRAP_CHARS,
    centerX: false,
  })
  group.add(textBlock)

  // ── compute bounds ──────────────────────────────────────────
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())

  return {
    group,
    boundingSize: size,
    dispose: () => disposeGroup(group),
  }
}
