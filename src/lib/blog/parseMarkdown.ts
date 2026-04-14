import { Lexer, type Token, type Tokens } from 'marked'

import type { BlogBlock, BlogDocument } from './types'

const PARAGRAPH_PAGE_TARGET = 440
const LIST_PAGE_SIZE = 6
const CODE_PAGE_SIZE = 12
const DIAGRAM_PAGE_SIZE = 18
const DIAGRAM_LANGUAGES = new Set([
  'mermaid',
  'plantuml',
  'puml',
  'uml',
  'd2',
  'dot',
  'graphviz',
])
const MATH_LANGUAGES = new Set(['math', 'latex', 'katex', 'tex'])

export function parseMarkdownDocument(markdown: string): BlogDocument {
  const raw = markdown.trim() || '# Untitled Flight\n\nStart writing to build a 3D article.'
  const source = preprocessMathBlocks(raw)
  const tokens = Lexer.lex(source)
  const blocks: BlogBlock[] = []
  let headingCount = 0
  let paragraphCount = 0
  let listCount = 0
  let codeCount = 0
  let quoteCount = 0
  let tableCount = 0
  let formulaCount = 0
  let currentSection = 0

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        currentSection += 1
        headingCount += 1
        blocks.push({
          id: `heading-${headingCount}`,
          kind: 'heading',
          text: normalizeWhitespace(flattenInlineTokens(token.tokens)),
          label: `Waypoint ${headingCount.toString().padStart(2, '0')}`,
          level: token.depth,
          sectionIndex: currentSection,
        })
        break
      }
      case 'paragraph':
      case 'text': {
        const text = normalizeWhitespace(getTokenText(token))
        if (!text) {
          break
        }

        const pages = chunkNarrative(text, PARAGRAPH_PAGE_TARGET)
        for (const page of pages) {
          paragraphCount += 1
          blocks.push({
            id: `paragraph-${paragraphCount}`,
            kind: 'paragraph',
            text: page,
            label: `Passage ${paragraphCount.toString().padStart(2, '0')}`,
            sectionIndex: currentSection,
          })
        }
        break
      }
      case 'list': {
        const items = token.items
          .map((item) => normalizeWhitespace(getTokenText(item)))
          .filter(Boolean)

        for (const [index, slice] of paginate(items, LIST_PAGE_SIZE).entries()) {
          listCount += 1
          const orderedStart =
            typeof token.start === 'number' ? token.start + index * LIST_PAGE_SIZE : null

          blocks.push({
            id: `list-${listCount}`,
            kind: 'list',
            text: slice
              .map((item, itemIndex) =>
                token.ordered
                  ? `${(orderedStart ?? 1) + itemIndex}. ${item}`
                  : `• ${item}`,
              )
              .join('\n'),
            items: slice,
            label: token.ordered
              ? `Sequence ${listCount.toString().padStart(2, '0')}`
              : `Checklist ${listCount.toString().padStart(2, '0')}`,
            sectionIndex: currentSection,
          })
        }
        break
      }
      case 'code': {
        if (isMathLanguage(token.lang)) {
          formulaCount += 1
          blocks.push({
            id: `formula-${formulaCount}`,
            kind: 'formula',
            text: token.text.replace(/\r\n/g, '\n').trim(),
            label: `Formula ${formulaCount.toString().padStart(2, '0')}`,
            language: token.lang,
            sectionIndex: currentSection,
          })
          break
        }

        const kind = isDiagramLanguage(token.lang) ? 'diagram' : 'code'
        const normalizedCode = normalizeCodeText(token.text)

        // Mermaid diagrams stay as a single block (no pagination)
        // so the 3D UML builder gets the full graph source
        if (token.lang?.trim().toLowerCase() === 'mermaid') {
          codeCount += 1
          blocks.push({
            id: `code-${codeCount}`,
            kind,
            text: normalizedCode,
            label: formatCodeLabel(token.lang, kind, codeCount),
            language: token.lang,
            sectionIndex: currentSection,
          })
          break
        }

        const lines = normalizedCode.split('\n')
        const pageSize = kind === 'diagram' ? DIAGRAM_PAGE_SIZE : CODE_PAGE_SIZE

        for (const slice of paginate(lines, pageSize)) {
          codeCount += 1
          blocks.push({
            id: `code-${codeCount}`,
            kind,
            text: slice.join('\n'),
            label: formatCodeLabel(token.lang, kind, codeCount),
            language: token.lang,
            sectionIndex: currentSection,
          })
        }
        break
      }
      case 'blockquote': {
        const quoteText = normalizeWhitespace(getTokenText(token))
        if (!quoteText) {
          break
        }

        for (const page of chunkNarrative(quoteText, PARAGRAPH_PAGE_TARGET - 60)) {
          quoteCount += 1
          blocks.push({
            id: `quote-${quoteCount}`,
            kind: 'quote',
            text: page,
            label: `Signal ${quoteCount.toString().padStart(2, '0')}`,
            sectionIndex: currentSection,
          })
        }
        break
      }
      case 'table': {
        tableCount += 1
        const rows = [
          token.header.map((cell) => flattenInlineTokens(cell.tokens)).join(' | '),
          ...token.rows.map((row) =>
            row.map((cell) => flattenInlineTokens(cell.tokens)).join(' | '),
          ),
        ]
        blocks.push({
          id: `table-${tableCount}`,
          kind: 'table',
          text: rows.join('\n'),
          label: `Data Grid ${tableCount.toString().padStart(2, '0')}`,
          sectionIndex: currentSection,
        })
        break
      }
      case 'hr': {
        currentSection += 1
        break
      }
      case 'html': {
        const notesMatch = token.text.match(/<!--\s*notes?:\s*([\s\S]*?)\s*-->/)
        if (notesMatch && blocks.length > 0) {
          blocks[blocks.length - 1]!.notes = notesMatch[1]!.trim()
        }
        break
      }
      default:
        break
    }
  }

  const safeBlocks =
    blocks.length > 0
      ? blocks
      : [
          {
            id: 'paragraph-1',
            kind: 'paragraph',
            text: 'Upload a markdown file or start typing to generate a 3D article.',
            label: 'Passage 01',
          } satisfies BlogBlock,
        ]

  const firstHeading = safeBlocks.find((block) => block.kind === 'heading')
  const firstParagraph = safeBlocks.find((block) => block.kind === 'paragraph')
  const plainText = safeBlocks.map((block) => block.text).join(' ')
  const wordCount = countWords(plainText)

  return {
    title: firstHeading?.text ?? 'Untitled 3D Article',
    excerpt:
      firstParagraph?.text ??
      safeBlocks[0]?.text ??
      'Markdown becomes spatial content panels.',
    blocks: safeBlocks,
    stats: {
      wordCount,
      readingMinutes: Math.max(1, Math.round(wordCount / 190)),
      sectionCount: safeBlocks.length,
    },
  }
}

function getTokenText(token: Token): string {
  switch (token.type) {
    case 'paragraph':
    case 'heading':
    case 'blockquote':
      return flattenInlineTokens(token.tokens)
    case 'text':
      return token.tokens?.length ? flattenInlineTokens(token.tokens) : token.text
    case 'list_item':
      return token.tokens?.length ? flattenInlineTokens(token.tokens) : token.text
    case 'code':
      return token.text
    case 'table':
      return [
        token.header.map((cell) => flattenInlineTokens(cell.tokens)).join(' | '),
        ...token.rows.map((row) =>
          row.map((cell) => flattenInlineTokens(cell.tokens)).join(' | '),
        ),
      ].join('\n')
    default:
      return 'text' in token ? String(token.text ?? '') : ''
  }
}

function flattenInlineTokens(tokens: Token[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'text':
        case 'escape':
        case 'codespan':
          return token.text
        case 'strong':
        case 'em':
        case 'del':
        case 'link':
        case 'image':
        case 'heading':
        case 'paragraph':
        case 'blockquote':
          return flattenInlineTokens(token.tokens)
        case 'br':
          return '\n'
        case 'list':
          return token.items.map((item) => getTokenText(item)).join('\n')
        case 'list_item':
          return getTokenText(token)
        case 'code':
          return token.text
        default:
          return 'text' in token ? String(token.text ?? '') : ''
      }
    })
    .join('')
}

function chunkNarrative(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text]
  }

  const sentences = text.match(/[^.!?]+[.!?]?/g) ?? [text]
  const pages: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence.trim()}` : sentence.trim()
    if (next.length > maxChars && current) {
      pages.push(current)
      current = sentence.trim()
      continue
    }

    current = next
  }

  if (current) {
    pages.push(current)
  }

  return pages
}

function paginate<T>(items: T[], size: number): T[][] {
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size))
  }
  return pages
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
}

function normalizeCodeText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\t/g, '  ').trimEnd()
  return normalized.length > 0 ? normalized : '// empty'
}

function isDiagramLanguage(language?: string) {
  return language ? DIAGRAM_LANGUAGES.has(language.trim().toLowerCase()) : false
}

function isMathLanguage(language?: string) {
  return language ? MATH_LANGUAGES.has(language.trim().toLowerCase()) : false
}

function preprocessMathBlocks(source: string): string {
  return source.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, math: string) => {
    return `\`\`\`math\n${math.trim()}\n\`\`\``
  })
}

function formatCodeLabel(
  language: string | undefined,
  kind: BlogBlock['kind'],
  index: number,
) {
  const base = language ? language.toUpperCase() : kind === 'diagram' ? 'UML' : 'CODE'
  return kind === 'diagram'
    ? `${base} Diagram`
    : `${base} ${index.toString().padStart(2, '0')}`
}

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g)
  return matches?.length ?? 0
}
