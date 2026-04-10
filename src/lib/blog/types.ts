export type BlogEnvironment = 'space' | 'train'

export type BlogBlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'code'
  | 'diagram'
  | 'table'

export interface BlogBlock {
  id: string
  kind: BlogBlockKind
  text: string
  label: string
  level?: number
  items?: string[]
  language?: string
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
