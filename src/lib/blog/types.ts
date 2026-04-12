export type BlogEnvironment = 'space' | 'train' | 'cosmos'

export type BlogBlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'code'
  | 'diagram'
  | 'table'
  | 'formula'

export interface BlogBlock {
  id: string
  kind: BlogBlockKind
  text: string
  label: string
  level?: number
  items?: string[]
  language?: string
  notes?: string
  sectionIndex?: number
}

export interface BlogDocument {
  title: string
  excerpt: string
  blocks: BlogBlock[]
  stats: {
    wordCount: number
    readingMinutes: number
    sectionCount: number
  }
}
