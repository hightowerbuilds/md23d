import type { MermaidGraph, GraphLayout, NodeLayout, EdgeLayout } from './types'

const NODE_GAP_X = 3.2
const NODE_GAP_Y = 2.8
const NODE_GAP_Z = 1.8   // depth between layers for true 3D
const CHAR_W = 0.22

export function layoutGraph(graph: MermaidGraph): GraphLayout {
  const { nodes, edges, direction } = graph

  // adjacency
  const children = new Map<string, string[]>()
  const parentCount = new Map<string, number>()

  for (const [id] of nodes) {
    children.set(id, [])
    parentCount.set(id, 0)
  }
  for (const e of edges) {
    children.get(e.from)?.push(e.to)
    parentCount.set(e.to, (parentCount.get(e.to) ?? 0) + 1)
  }

  // roots = zero in-degree (or first node if cyclic)
  const roots = [...nodes.keys()].filter(id => !parentCount.get(id))
  if (roots.length === 0 && nodes.size > 0) roots.push(nodes.keys().next().value!)

  // BFS layers (longest-path so wide trees don't collapse)
  const layer = new Map<string, number>()
  const queue = [...roots]
  for (const r of roots) layer.set(r, 0)

  while (queue.length) {
    const id = queue.shift()!
    const d = layer.get(id)!
    for (const c of children.get(id) ?? []) {
      if (!layer.has(c) || layer.get(c)! < d + 1) {
        layer.set(c, d + 1)
        queue.push(c)
      }
    }
  }
  // disconnected nodes
  for (const [id] of nodes) if (!layer.has(id)) layer.set(id, 0)

  // group by layer
  const groups = new Map<number, string[]>()
  for (const [id, l] of layer) {
    if (!groups.has(l)) groups.set(l, [])
    groups.get(l)!.push(id)
  }

  // assign positions
  const nodeLayouts: NodeLayout[] = []

  for (const [l, ids] of groups) {
    const count = ids.length
    for (let i = 0; i < count; i++) {
      const node = nodes.get(ids[i])!
      const width = Math.max(node.label.length * CHAR_W + 0.6, 1.4)
      const height = 0.7
      const offset = i - (count - 1) / 2

      let x = 0,
        y = 0,
        z = 0

      // Z-depth: each layer recedes, siblings spread slightly in Z too
      const siblingZSpread = (offset * 0.4)

      switch (direction) {
        case 'TD':
          x = offset * NODE_GAP_X
          y = -l * NODE_GAP_Y
          z = -l * NODE_GAP_Z + siblingZSpread
          break
        case 'BT':
          x = offset * NODE_GAP_X
          y = l * NODE_GAP_Y
          z = -l * NODE_GAP_Z + siblingZSpread
          break
        case 'LR':
          x = l * NODE_GAP_X
          y = -offset * NODE_GAP_Y
          z = -l * NODE_GAP_Z + siblingZSpread
          break
        case 'RL':
          x = -l * NODE_GAP_X
          y = -offset * NODE_GAP_Y
          z = -l * NODE_GAP_Z + siblingZSpread
          break
      }

      nodeLayouts.push({ node, x, y, z, width, height })
    }
  }

  // edge endpoints
  const posMap = new Map<string, { x: number; y: number; z: number }>()
  for (const nl of nodeLayouts) posMap.set(nl.node.id, { x: nl.x, y: nl.y, z: nl.z })

  const edgeLayouts: EdgeLayout[] = edges.map(e => ({
    edge: e,
    fromPos: posMap.get(e.from) ?? { x: 0, y: 0, z: 0 },
    toPos: posMap.get(e.to) ?? { x: 0, y: 0, z: 0 },
  }))

  return { nodes: nodeLayouts, edges: edgeLayouts, direction }
}
