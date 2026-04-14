import type * as THREE from 'three'

// ── builder result ───────────────────────────────────────────────

export interface Block3DResult {
  group: THREE.Group
  /** World-space bounding size so the composer knows how much room it takes */
  boundingSize: THREE.Vector3
  dispose: () => void
}

// ── palette ──────────────────────────────────────────────────────

export const MD3D_PALETTE = {
  // text
  heading: 0xeaf4ff,
  headingAccent: 0x78daff,
  body: 0xd0e4f5,
  bodySoft: 0x8aafc8,
  code: 0xa8e6cf,
  codeFrame: 0x3a6e5c,
  codeBg: 0x0a1f16,

  // structure
  frame: 0x78daff,
  frameSoft: 0x2a5a7a,
  accent: 0x78daff,
  accentSecondary: 0x5b8def,
  quote: 0xf0c674,
  quoteFrame: 0x7a6432,
  list: 0xa8d8ff,
  listConnector: 0x4a7aaa,
  table: 0xb0c4de,
  tableFrame: 0x4a6a8a,
  formula: 0xd4b8ff,

  // emissive multiplier
  emissive: 0.12,
} as const

// ── shared constants ─────────────────────────────────────────────

/** Character size for body text */
export const BODY_CHAR_SIZE = 0.16
/** Character size for headings */
export const HEADING_CHAR_SIZE = 0.32
/** Character size for code */
export const CODE_CHAR_SIZE = 0.13
/** Extrusion depth for all text */
export const TEXT_DEPTH = 0.035
/** Horizontal spacing between characters (body) */
export const BODY_CHAR_SPACING = 0.12
/** Horizontal spacing between characters (heading) */
export const HEADING_CHAR_SPACING = 0.22
/** Horizontal spacing between characters (code, monospace) */
export const CODE_CHAR_SPACING = 0.10
/** Z offset between successive lines for reading depth */
export const LINE_Z_STEP = 0.08
/** Y offset between successive lines */
export const LINE_Y_STEP = 0.28
/** Y offset between successive lines (code, tighter) */
export const CODE_LINE_Y_STEP = 0.22
/** Max characters per line before wrapping */
export const LINE_WRAP_CHARS = 60
/** Max characters per line for code (wider) */
export const CODE_LINE_WRAP_CHARS = 72
