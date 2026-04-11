import { parseMarkdownDocument } from './parseMarkdown'
import type { BlogDocument } from './types'

const HTML_EXTENSION_PATTERN = /\.(html?|xhtml)$/i
const HTML_SNIPPET_PATTERN =
  /^\s*(<!doctype\s+html|<html[\s>]|<body[\s>]|<(article|section|main|div|p|h[1-6]|ul|ol|li|blockquote|pre|table)\b)/i

const CONTAINER_TAGS = new Set([
  'html',
  'body',
  'main',
  'article',
  'section',
  'div',
  'header',
  'footer',
  'aside',
  'figure',
  'figcaption',
  'nav',
])

const SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'template'])

export function parseUploadedDocument(
  source: string,
  filenameOrLabel?: string,
): BlogDocument {
  return shouldTreatAsHtml(source, filenameOrLabel)
    ? parseHtmlDocument(source)
    : parseMarkdownDocument(source)
}

function shouldTreatAsHtml(source: string, filenameOrLabel?: string) {
  return (
    HTML_EXTENSION_PATTERN.test(filenameOrLabel ?? '') ||
    HTML_SNIPPET_PATTERN.test(source)
  )
}

function parseHtmlDocument(source: string) {
  if (typeof DOMParser === 'undefined') {
    return parseMarkdownDocument(source)
  }

  const document = new DOMParser().parseFromString(source, 'text/html')
  const markdown = serializeChildren(document.body).join('\n\n').trim()

  return parseMarkdownDocument(
    markdown || '# Untitled Flight\n\nUpload an HTML file to generate a 3D article.',
  )
}

function serializeChildren(parent: ParentNode): string[] {
  const blocks: string[] = []

  for (const node of Array.from(parent.childNodes)) {
    const block = serializeBlock(node)
    if (block) {
      blocks.push(block)
    }
  }

  return blocks
}

function serializeBlock(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeWhitespace(node.textContent ?? '')
  }

  if (!(node instanceof Element)) {
    return ''
  }

  const tagName = node.tagName.toLowerCase()
  if (SKIPPED_TAGS.has(tagName)) {
    return ''
  }

  if (CONTAINER_TAGS.has(tagName)) {
    return serializeChildren(node).join('\n\n')
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number.parseInt(tagName.slice(1), 10)
    const text = normalizeWhitespace(node.textContent ?? '')
    return text ? `${'#'.repeat(level)} ${text}` : ''
  }

  if (tagName === 'p') {
    return normalizeWhitespace(readInlineText(node))
  }

  if (tagName === 'ul' || tagName === 'ol') {
    const items = Array.from(node.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI')
      .map((child, index) => {
        const text = normalizeWhitespace(readInlineText(child))
        if (!text) {
          return ''
        }

        return tagName === 'ol' ? `${index + 1}. ${text}` : `- ${text}`
      })
      .filter(Boolean)

    return items.join('\n')
  }

  if (tagName === 'blockquote') {
    const lines = normalizeWhitespace(readInlineText(node))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `> ${line}`)

    return lines.join('\n')
  }

  if (tagName === 'pre') {
    const codeElement = node.querySelector('code')
    const language = detectCodeLanguage(codeElement ?? node)
    const code = readCodeText(codeElement ?? node)

    return language ? `\`\`\`${language}\n${code}\n\`\`\`` : `\`\`\`\n${code}\n\`\`\``
  }

  if (tagName === 'table') {
    return serializeTable(node)
  }

  if (tagName === 'hr') {
    return '---'
  }

  if (tagName === 'br') {
    return ''
  }

  return normalizeWhitespace(readInlineText(node))
}

function readInlineText(element: Element): string {
  const parts: string[] = []

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) {
        parts.push(text)
      }
      continue
    }

    if (!(node instanceof Element)) {
      continue
    }

    const tagName = node.tagName.toLowerCase()
    if (SKIPPED_TAGS.has(tagName)) {
      continue
    }

    if (tagName === 'br') {
      parts.push('\n')
      continue
    }

    if (tagName === 'pre') {
      parts.push(readCodeText(node))
      continue
    }

    parts.push(readInlineText(node))
  }

  return parts.join(' ')
}

function readCodeText(element: Element): string {
  const text = (element.textContent ?? '').replace(/\r\n/g, '\n').trimEnd()
  return text || '// empty'
}

function detectCodeLanguage(element: Element) {
  const className = element.getAttribute('class') ?? ''
  const languageMatch = className.match(/(?:language|lang)-([a-z0-9_-]+)/i)
  return languageMatch?.[1]?.toLowerCase() ?? ''
}

function serializeTable(table: Element) {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => /^(TH|TD)$/.test(cell.tagName))
        .map((cell) => escapeTableCell(normalizeWhitespace(readInlineText(cell))))
        .filter(Boolean),
    )
    .filter((cells) => cells.length > 0)

  if (rows.length === 0) {
    return ''
  }

  const header = rows[0]!
  const separator = header.map(() => '---')
  const body = rows.slice(1)
  const allRows = [header, separator, ...body]

  return allRows.map((cells) => `| ${cells.join(' | ')} |`).join('\n')
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, '\\|')
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
}
