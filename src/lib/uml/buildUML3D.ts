import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import { parseMermaid } from './parseMermaid'
import { layoutGraph } from './layoutGraph3D'
import {
  createLabel,
  createNodeFrame,
  createEdge,
  createEdgeLabel,
  CHAR_DEPTH,
} from './meshFactories'
import type { GraphLayout } from './types'

// ── font cache ───────────────────────────────────────────────────

let fontCache: Font | null = null

export async function loadUMLFont(): Promise<Font> {
  if (fontCache) return fontCache
  const loader = new FontLoader()
  return new Promise<Font>((resolve, reject) => {
    loader.load(
      '/fonts/droid_sans_mono_regular.typeface.json',
      (font) => {
        fontCache = font
        resolve(font)
      },
      undefined,
      reject,
    )
  })
}

export function getUMLFont(): Font | null {
  return fontCache
}

export function setUMLFont(font: Font) {
  fontCache = font
}

// ── public result type ───────────────────────────────────────────

export interface UML3DResult {
  group: THREE.Group
  layout: GraphLayout
  nodeGroups: Map<string, THREE.Group>
  dispose: () => void
}

// ── build the full 3D graph ──────────────────────────────────────

export function buildUML3D(
  mermaidSource: string,
  font: Font,
): UML3DResult {
  const graph = parseMermaid(mermaidSource)
  const layout = layoutGraph(graph)

  const root = new THREE.Group()
  root.name = 'uml-3d'
  const nodeGroups = new Map<string, THREE.Group>()

  // ── nodes ────────────────────────────────────────────────────

  for (const nl of layout.nodes) {
    const g = new THREE.Group()
    g.name = `node-${nl.node.id}`
    g.position.set(nl.x, nl.y, nl.z)

    // frame (wireframe box / diamond / sphere)
    g.add(createNodeFrame(nl.node.shape, nl.width, nl.height))

    // label — every character is its own extruded 3D mesh
    const label = createLabel(nl.node.label, font)
    label.position.z = CHAR_DEPTH + 0.01 // float just in front of frame
    g.add(label)

    root.add(g)
    nodeGroups.set(nl.node.id, g)
  }

  // ── edges ────────────────────────────────────────────────────

  for (const el of layout.edges) {
    const from = new THREE.Vector3(el.fromPos.x, el.fromPos.y, el.fromPos.z)
    const to = new THREE.Vector3(el.toPos.x, el.toPos.y, el.toPos.z)

    // shorten so edge starts/ends at node border, not center
    const fromNL = layout.nodes.find(n => n.node.id === el.edge.from)
    const toNL = layout.nodes.find(n => n.node.id === el.edge.to)
    if (fromNL && toNL) {
      const d = to.clone().sub(from).normalize()
      from.add(d.clone().multiplyScalar(fromNL.height / 2 + 0.08))
      to.sub(d.clone().multiplyScalar(toNL.height / 2 + 0.08))
    }

    root.add(createEdge(from, to, el.edge.style))

    if (el.edge.label) {
      const mid = from.clone().add(to).multiplyScalar(0.5)
      root.add(createEdgeLabel(el.edge.label, mid, font))
    }
  }

  // ── center the whole thing on the origin ─────────────────────

  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.sub(center)

  return {
    group: root,
    layout,
    nodeGroups,
    dispose() {
      root.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach(m => m.dispose())
        }
      })
    },
  }
}
