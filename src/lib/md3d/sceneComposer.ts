import * as THREE from 'three'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import type { BlogBlock } from '../blog/types'
import type { Block3DResult } from './types'
import { buildUML3D } from '../uml'

// ── layout constants ─────────────────────────────────────────────

const CARD_PIXEL_WIDTH = 900
const CARD_WORLD_WIDTH = 4.2
const CARD_PADDING = 60
const BLOCK_GAP_Y = 0.6
const SECTION_GAP_Y = 1.4
const DIAGRAM_SCALE = 0.75

// ── canvas card builder (readable text on a plane) ───────────────

function buildCanvasCard(block: BlogBlock): Block3DResult | null {
  let canvas: HTMLCanvasElement
  try {
    canvas = document.createElement('canvas')
  } catch {
    return null
  }

  canvas.width = CARD_PIXEL_WIDTH

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const isHeading = block.kind === 'heading'
  const isCode =
    block.kind === 'code' || block.kind === 'diagram' || block.kind === 'table'

  const bodySize = isCode ? 20 : 26
  const bodyFont = isCode
    ? `400 ${bodySize}px monospace`
    : `400 ${bodySize}px sans-serif`
  const lineHeight = isCode ? 26 : 34

  // Measure with correct font
  ctx.font = bodyFont
  const lines = wrapCanvasText(ctx, block.text, CARD_PIXEL_WIDTH - CARD_PADDING * 2)
  const bodyHeight = Math.max(lines.length * lineHeight, lineHeight)

  const headerHeight = 80
  canvas.height = Math.max(headerHeight + bodyHeight + CARD_PADDING + 20, 140)

  // Background
  ctx.fillStyle = 'rgba(8, 16, 32, 0.85)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Border
  ctx.strokeStyle = 'rgba(120, 218, 255, 0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8)

  // Accent bar
  ctx.fillStyle = isHeading ? '#78daff' : 'rgba(120, 218, 255, 0.5)'
  ctx.fillRect(CARD_PADDING, 30, isHeading ? 160 : 100, isHeading ? 5 : 3)

  // Label
  ctx.fillStyle = 'rgba(138, 175, 200, 0.7)'
  ctx.font = '600 16px sans-serif'
  ctx.fillText(block.label.toUpperCase(), CARD_PADDING, 62)

  // Code panel background
  if (isCode) {
    ctx.fillStyle = 'rgba(10, 31, 22, 0.6)'
    ctx.fillRect(
      CARD_PADDING - 16,
      headerHeight - 8,
      canvas.width - CARD_PADDING * 2 + 32,
      bodyHeight + 24,
    )
  }

  // Body text
  ctx.fillStyle = isCode ? '#a8e6cf' : isHeading ? '#eaf4ff' : '#d0e4f5'
  ctx.font = isHeading ? `700 ${36}px sans-serif` : bodyFont

  if (isHeading) {
    // Re-wrap for heading size
    const headingLines = wrapCanvasText(ctx, block.text, CARD_PIXEL_WIDTH - CARD_PADDING * 2)
    for (let i = 0; i < headingLines.length; i++) {
      ctx.fillText(headingLines[i], CARD_PADDING, headerHeight + i * 44 + 36)
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], CARD_PADDING, headerHeight + i * lineHeight + bodySize)
    }
  }

  // Create 3D mesh
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const aspect = canvas.height / canvas.width
  const planeH = CARD_WORLD_WIDTH * aspect
  const geometry = new THREE.PlaneGeometry(CARD_WORLD_WIDTH, planeH)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)

  const group = new THREE.Group()
  group.name = `card-${block.id}`
  group.add(mesh)

  return {
    group,
    boundingSize: new THREE.Vector3(CARD_WORLD_WIDTH, planeH, 0.01),
    dispose() {
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const rawLines = text.split('\n')
  const result: string[] = []

  for (const raw of rawLines) {
    if (!raw.trim()) {
      result.push('')
      continue
    }
    const words = raw.split(/\s+/)
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      const w = ctx.measureText(test).width
      if (w > maxWidth && line) {
        result.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) result.push(line)
  }

  return result.length > 0 ? result : ['']
}

// ── Mermaid diagram builder (true 3D) ────────────────────────────

function buildDiagram3D(block: BlogBlock, font: Font): Block3DResult | null {
  if (
    block.language?.trim().toLowerCase() !== 'mermaid' ||
    !/^(graph|flowchart)\s/i.test(block.text.trim())
  ) {
    return null
  }

  try {
    const result = buildUML3D(block.text, font)
    const box = new THREE.Box3().setFromObject(result.group)
    const size = box.getSize(new THREE.Vector3())

    if (size.x === 0 && size.y === 0) return null

    const scale = (CARD_WORLD_WIDTH / Math.max(size.x, 1)) * DIAGRAM_SCALE
    result.group.scale.setScalar(scale)

    return {
      group: result.group,
      boundingSize: size.multiplyScalar(scale),
      dispose: result.dispose,
    }
  } catch (e) {
    console.warn('Diagram 3D build failed for block', block.id, e)
    return null
  }
}

// ── block dispatch ───────────────────────────────────────────────

function buildBlock(block: BlogBlock, font: Font): Block3DResult | null {
  try {
    // Mermaid diagrams → 3D mesh objects
    if (block.kind === 'diagram') {
      const diagram = buildDiagram3D(block, font)
      if (diagram) return diagram
    }

    // Everything else → readable canvas card
    return buildCanvasCard(block)
  } catch (e) {
    console.warn('Block build failed:', block.id, block.kind, e)
    return null
  }
}

// ── compose full document ────────────────────────────────────────

export interface ComposedScene {
  root: THREE.Group
  blockGroups: { block: BlogBlock; group: THREE.Group; result: Block3DResult }[]
  dispose: () => void
}

function yieldToMain(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

export async function composeSceneAsync(
  blocks: BlogBlock[],
  font: Font,
  onProgress?: (built: number, total: number) => void,
): Promise<ComposedScene> {
  const root = new THREE.Group()
  root.name = 'md3d-document'

  const blockGroups: ComposedScene['blockGroups'] = []
  let cursorY = 0
  let cursorZ = 0
  let lastSection = -1
  const total = blocks.length

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    // Yield every few blocks so the progress bar paints
    if (i % 3 === 0) {
      onProgress?.(i, total)
      await yieldToMain()
    }

    const result = buildBlock(block, font)
    if (!result) continue

    if (block.sectionIndex !== undefined && block.sectionIndex !== lastSection) {
      if (lastSection >= 0) cursorY -= SECTION_GAP_Y
      lastSection = block.sectionIndex
    }

    const { group, boundingSize } = result
    group.position.set(0, cursorY, cursorZ)
    root.add(group)
    blockGroups.push({ block, group, result })

    cursorY -= boundingSize.y + BLOCK_GAP_Y
    cursorZ += 0.08
  }

  onProgress?.(total, total)

  // Center vertically — guard against empty scene
  if (blockGroups.length > 0) {
    const box = new THREE.Box3().setFromObject(root)
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      root.position.y -= center.y
      root.position.z -= center.z
    }
  }

  return {
    root,
    blockGroups,
    dispose() {
      for (const { result } of blockGroups) result.dispose()
      root.clear()
    },
  }
}

// Sync version for /uml route
export function composeScene(
  blocks: BlogBlock[],
  font: Font,
): ComposedScene {
  const root = new THREE.Group()
  root.name = 'md3d-document'

  const blockGroups: ComposedScene['blockGroups'] = []
  let cursorY = 0
  let cursorZ = 0
  let lastSection = -1

  for (const block of blocks) {
    const result = buildBlock(block, font)
    if (!result) continue

    if (block.sectionIndex !== undefined && block.sectionIndex !== lastSection) {
      if (lastSection >= 0) cursorY -= SECTION_GAP_Y
      lastSection = block.sectionIndex
    }

    const { group, boundingSize } = result
    group.position.set(0, cursorY, cursorZ)
    root.add(group)
    blockGroups.push({ block, group, result })

    cursorY -= boundingSize.y + BLOCK_GAP_Y
    cursorZ += 0.08
  }

  if (blockGroups.length > 0) {
    const box = new THREE.Box3().setFromObject(root)
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      root.position.y -= center.y
      root.position.z -= center.z
    }
  }

  return {
    root,
    blockGroups,
    dispose() {
      for (const { result } of blockGroups) result.dispose()
      root.clear()
    },
  }
}
