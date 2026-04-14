export { buildHeading } from './headingBuilder'
export { buildParagraph } from './paragraphBuilder'
export { buildCode } from './codeBuilder'
export { composeScene } from './sceneComposer'
export type { ComposedScene } from './sceneComposer'
export type { Block3DResult } from './types'
export {
  createCharMesh,
  createLineGroup,
  createTextBlock,
  createAccentBar,
  createEnclosure,
  wrapText,
  clearGeoCache,
  disposeGroup,
} from './textFactory'
export {
  MD3D_PALETTE,
  BODY_CHAR_SIZE,
  HEADING_CHAR_SIZE,
  CODE_CHAR_SIZE,
} from './types'
