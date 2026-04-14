import * as THREE from 'three'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import type { BlogBlock } from '../blog/types'
import type { Block3DResult } from './types'
import {
  CODE_CHAR_SIZE,
  CODE_CHAR_SPACING,
  CODE_LINE_Y_STEP,
  LINE_Z_STEP,
  CODE_LINE_WRAP_CHARS,
  TEXT_DEPTH,
  MD3D_PALETTE,
} from './types'
import {
  createLineGroup,
  createEnclosure,
  createAccentBar,
  disposeGroup,
} from './textFactory'

/**
 * Code → 3D character grid
 *
 * Each character is its own extruded mesh in a monospace grid.
 * Lines step forward in Z so the code block has depth.
 * A wireframe enclosure wraps the whole thing.
 */
export function buildCode(block: BlogBlock, font: Font): Block3DResult {
  const group = new THREE.Group()
  group.name = `code-${block.id}`

  // Split into lines (preserve original line breaks, no word-wrap)
  const rawLines = block.text.split('\n')
  // Truncate very long lines
  const lines = rawLines.map(l =>
    l.length > CODE_LINE_WRAP_CHARS ? l.slice(0, CODE_LINE_WRAP_CHARS) + '\u2026' : l,
  )

  const maxLineLen = Math.max(...lines.map(l => l.length), 1)

  // ── label ───────────────────────────────────────────────────
  const langLabel = (block.language || 'CODE').toUpperCase()
  const label = createLineGroup(langLabel, font, {
    size: 0.065,
    spacing: 0.055,
    depth: TEXT_DEPTH * 0.5,
    color: MD3D_PALETTE.code,
    centerX: false,
  })
  label.position.y = 0.22
  label.position.x = -0.1
  group.add(label)

  // ── accent bar ──────────────────────────────────────────────
  const barWidth = maxLineLen * CODE_CHAR_SPACING * 0.4
  const bar = createAccentBar(barWidth, MD3D_PALETTE.code, 0.025, TEXT_DEPTH * 0.5)
  bar.position.y = 0.14
  bar.position.x = -0.1 + barWidth / 2
  group.add(bar)

  // ── character grid ──────────────────────────────────────────
  const codeGroup = new THREE.Group()
  codeGroup.name = 'code-lines'

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]
    if (!line.trim()) continue // skip empty lines (leave gap)

    const lineGroup = createLineGroup(line, font, {
      size: CODE_CHAR_SIZE,
      spacing: CODE_CHAR_SPACING,
      depth: TEXT_DEPTH,
      color: MD3D_PALETTE.code,
      centerX: false,
    })
    lineGroup.position.y = -row * CODE_LINE_Y_STEP
    lineGroup.position.z = row * LINE_Z_STEP
    codeGroup.add(lineGroup)
  }

  group.add(codeGroup)

  // ── line numbers ────────────────────────────────────────────
  const numGroup = new THREE.Group()
  numGroup.name = 'line-numbers'

  for (let row = 0; row < lines.length; row++) {
    const numStr = String(row + 1).padStart(3, ' ')
    const numLine = createLineGroup(numStr, font, {
      size: CODE_CHAR_SIZE * 0.75,
      spacing: CODE_CHAR_SPACING * 0.75,
      depth: TEXT_DEPTH * 0.5,
      color: MD3D_PALETTE.bodySoft,
      centerX: false,
    })
    numLine.position.y = -row * CODE_LINE_Y_STEP
    numLine.position.z = row * LINE_Z_STEP
    numLine.position.x = -(CODE_CHAR_SPACING * 4.5)
    numGroup.add(numLine)
  }

  group.add(numGroup)

  // ── wireframe enclosure ─────────────────────────────────────
  const gridWidth = maxLineLen * CODE_CHAR_SPACING + 0.6
  const gridHeight = lines.length * CODE_LINE_Y_STEP + 0.4
  const gridDepth = lines.length * LINE_Z_STEP + TEXT_DEPTH * 3

  const enclosure = createEnclosure(
    gridWidth,
    gridHeight,
    gridDepth,
    MD3D_PALETTE.codeFrame,
    0.04,
  )
  // Center the enclosure around the code
  enclosure.position.x = (maxLineLen * CODE_CHAR_SPACING) / 2 - 0.1
  enclosure.position.y = -(lines.length * CODE_LINE_Y_STEP) / 2 + 0.1
  enclosure.position.z = (lines.length * LINE_Z_STEP) / 2
  group.add(enclosure)

  // ── compute bounds ──────────────────────────────────────────
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())

  return {
    group,
    boundingSize: size,
    dispose: () => disposeGroup(group),
  }
}
