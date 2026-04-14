export type NodeShape = 'rect' | 'rounded' | 'diamond' | 'circle' | 'asymmetric'
export type EdgeStyle = 'arrow' | 'line' | 'dotted' | 'thick'
export type Direction = 'TD' | 'LR' | 'BT' | 'RL'

export interface GraphNode {
  id: string
  label: string
  shape: NodeShape
}

export interface GraphEdge {
  from: string
  to: string
  label?: string
  style: EdgeStyle
}

export interface MermaidGraph {
  direction: Direction
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
}

export interface NodeLayout {
  node: GraphNode
  x: number
  y: number
  z: number
  width: number
  height: number
}

export interface EdgeLayout {
  edge: GraphEdge
  fromPos: { x: number; y: number; z: number }
  toPos: { x: number; y: number; z: number }
}

export interface GraphLayout {
  nodes: NodeLayout[]
  edges: EdgeLayout[]
  direction: Direction
}
