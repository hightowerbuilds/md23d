import type { MermaidGraph, GraphNode, GraphEdge, Direction, EdgeStyle } from './types'

export function parseMermaid(source: string): MermaidGraph {
  const lines = source
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'))

  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  let direction: Direction = 'TD'

  const firstLine = lines[0]
  const dirMatch = firstLine?.match(/^(?:graph|flowchart)\s+(TD|TB|LR|BT|RL)/i)
  if (dirMatch) {
    const dir = dirMatch[1].toUpperCase()
    direction = dir === 'TB' ? 'TD' : (dir as Direction)
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (
      line === 'end' ||
      line.startsWith('subgraph') ||
      line.startsWith('style ') ||
      line.startsWith('classDef ') ||
      line.startsWith('class ')
    )
      continue

    const edgeResult = parseEdgeLine(line, nodes)
    if (edgeResult) {
      edges.push(...edgeResult)
      continue
    }

    const node = parseNodeDef(line)
    if (node && !nodes.has(node.id)) {
      nodes.set(node.id, node)
    }
  }

  return { direction, nodes, edges }
}

// ── node definition ──────────────────────────────────────────────

function parseNodeDef(text: string): GraphNode | null {
  text = text.trim().replace(/;$/, '')
  let m: RegExpMatchArray | null

  // ((label)) — circle
  m = text.match(/^([a-zA-Z_][\w]*)\(\((.+?)\)\)$/)
  if (m) return { id: m[1], label: m[2], shape: 'circle' }

  // [label] — rectangle
  m = text.match(/^([a-zA-Z_][\w]*)\[(.+?)\]$/)
  if (m) return { id: m[1], label: m[2], shape: 'rect' }

  // (label) — rounded
  m = text.match(/^([a-zA-Z_][\w]*)\((.+?)\)$/)
  if (m) return { id: m[1], label: m[2], shape: 'rounded' }

  // {label} — diamond
  m = text.match(/^([a-zA-Z_][\w]*)\{(.+?)\}$/)
  if (m) return { id: m[1], label: m[2], shape: 'diamond' }

  // >label] — asymmetric / flag
  m = text.match(/^([a-zA-Z_][\w]*)>(.+?)\]$/)
  if (m) return { id: m[1], label: m[2], shape: 'asymmetric' }

  // bare ID
  m = text.match(/^([a-zA-Z_][\w]*)$/)
  if (m) return { id: m[1], label: m[1], shape: 'rect' }

  return null
}

// ── edge helpers ─────────────────────────────────────────────────

function ensureNode(token: string, nodes: Map<string, GraphNode>): string {
  const parsed = parseNodeDef(token)
  if (parsed) {
    if (!nodes.has(parsed.id)) nodes.set(parsed.id, parsed)
    return parsed.id
  }
  const idMatch = token.match(/^([a-zA-Z_][\w]*)/)
  if (idMatch) {
    const id = idMatch[1]
    if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: 'rect' })
    return id
  }
  return token
}

interface EdgePattern {
  regex: RegExp
  style: EdgeStyle
  labeled: boolean
}

const EDGE_PATTERNS: EdgePattern[] = [
  // labeled arrows  A -->|text| B  or  A -- text --> B
  { regex: /^(.+?)\s*-->\|([^|]*)\|\s*(.+)$/, style: 'arrow', labeled: true },
  { regex: /^(.+?)\s*--\s+(.+?)\s+-->\s*(.+)$/, style: 'arrow', labeled: true },
  { regex: /^(.+?)\s*==>\|([^|]*)\|\s*(.+)$/, style: 'thick', labeled: true },
  { regex: /^(.+?)\s*-\.->\|([^|]*)\|\s*(.+)$/, style: 'dotted', labeled: true },
  // unlabeled
  { regex: /^(.+?)\s*==>\s*(.+)$/, style: 'thick', labeled: false },
  { regex: /^(.+?)\s*-\.+->\s*(.+)$/, style: 'dotted', labeled: false },
  { regex: /^(.+?)\s*-->\s*(.+)$/, style: 'arrow', labeled: false },
  { regex: /^(.+?)\s*---\s*(.+)$/, style: 'line', labeled: false },
]

function parseEdgeLine(
  line: string,
  nodes: Map<string, GraphNode>,
): GraphEdge[] | null {
  line = line.replace(/;$/, '')

  for (const { regex, style, labeled } of EDGE_PATTERNS) {
    const m = line.match(regex)
    if (!m) continue

    if (labeled) {
      const fromId = ensureNode(m[1].trim(), nodes)
      const label = m[2].trim() || undefined
      const toId = ensureNode(m[3].trim(), nodes)
      return [{ from: fromId, to: toId, label, style }]
    } else {
      const fromId = ensureNode(m[1].trim(), nodes)
      const toId = ensureNode(m[2].trim(), nodes)
      return [{ from: fromId, to: toId, style }]
    }
  }

  return null
}
