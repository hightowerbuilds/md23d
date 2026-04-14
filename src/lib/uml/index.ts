export { parseMermaid } from './parseMermaid'
export { layoutGraph } from './layoutGraph3D'
export {
  createCharMesh,
  createLabel,
  createNodeFrame,
  createEdge,
  createEdgeLabel,
  CHAR_SIZE,
  CHAR_DEPTH,
  CHAR_SPACING,
} from './meshFactories'
export { buildUML3D, loadUMLFont, getUMLFont, setUMLFont } from './buildUML3D'
export type {
  GraphNode,
  GraphEdge,
  MermaidGraph,
  NodeLayout,
  EdgeLayout,
  GraphLayout,
  NodeShape,
  EdgeStyle,
  Direction,
} from './types'
export type { UML3DResult } from './buildUML3D'
