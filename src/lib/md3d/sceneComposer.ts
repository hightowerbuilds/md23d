import * as THREE from 'three'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import type { BlogBlock } from '../blog/types'
import type { Block3DResult } from './types'
import { buildHeading } from './headingBuilder'
import { buildParagraph } from './paragraphBuilder'
import { buildCode } from './codeBuilder'
import { buildUML3D } from '../uml'
import { disposeGroup } from './textFactory'

// ── spacing between block groups in the scene ────────────────────

const BLOCK_GAP_Y = 1.2
const SECTION_GAP_Y = 2.0
const Z_DRIFT_PER_BLOCK = 0.15

// ── builder dispatch ─────────────────────────────────────────────

function buildBlock(block: BlogBlock, font: Font): Block3DResult | null {
  switch (block.kind) {
    case 'heading':
      return buildHeading(block, font)

    case 'paragraph':
    case 'list':
    case 'quote':
      // Lists and quotes use paragraph builder for now — dedicated builders next
      return buildParagraph(block, font)

    case 'code':
      return buildCode(block, font)

    case 'diagram': {
      // Mermaid diagrams use the UML 3D builder
      if (
        block.language?.trim().toLowerCase() === 'mermaid' &&
        /^(graph|flowchart)\s/i.test(block.text.trim())
      ) {
        const result = buildUML3D(block.text, font)
        const box = new THREE.Box3().setFromObject(result.group)
        const size = box.getSize(new THREE.Vector3())
        return {
          group: result.group,
          boundingSize: size,
          dispose: result.dispose,
        }
      }
      // Non-mermaid diagrams → code builder fallback
      return buildCode(block, font)
    }

    case 'table':
    case 'formula':
      // Table and formula builders coming — paragraph fallback for now
      return buildParagraph(block, font)

    default:
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
    const result = buildBlock(block, font)

    // Yield every block so the browser can paint the progress bar
    if (i % 2 === 0) {
      onProgress?.(i, total)
      await yieldToMain()
    }

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
    cursorZ += Z_DRIFT_PER_BLOCK
  }

  onProgress?.(total, total)

  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.y -= center.y
  root.position.z -= center.z

  return {
    root,
    blockGroups,
    dispose() {
      for (const { result } of blockGroups) result.dispose()
      root.clear()
    },
  }
}

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

    // Extra gap between sections
    if (block.sectionIndex !== undefined && block.sectionIndex !== lastSection) {
      if (lastSection >= 0) cursorY -= SECTION_GAP_Y
      lastSection = block.sectionIndex
    }

    const { group, boundingSize } = result

    // Position: center X, descend in Y, drift forward in Z
    group.position.set(0, cursorY, cursorZ)

    root.add(group)
    blockGroups.push({ block, group, result })

    // Advance cursor
    cursorY -= boundingSize.y + BLOCK_GAP_Y
    cursorZ += Z_DRIFT_PER_BLOCK
  }

  // Center the whole document vertically
  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.y -= center.y
  root.position.z -= center.z

  return {
    root,
    blockGroups,
    dispose() {
      for (const { result } of blockGroups) result.dispose()
      root.clear()
    },
  }
}
