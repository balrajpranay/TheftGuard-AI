/**
 * TheftGuard AI — Assistant Message Formatting & Safe Tokenization
 *
 * Implements:
 * - Removal of unintended markdown escapes (e.g. \*\* -> **)
 * - Block parsing (headings, dividers, bullet lists, numbered steps, paragraphs)
 * - Safe inline tokenization (bold, italic, code, links)
 * - Strict URL sanitization (blocks javascript:, data:, vbscript: protocols)
 */

/**
 * Strips unintended literal backslash escapes often introduced by LLM generation or escape layers.
 */
export function cleanMarkdownEscapes(text = '') {
  if (text == null) return ''
  return String(text)
    .replace(/\\([*_`[\]()#\\])/g, '$1')
    .replace(/\\([*_`[\]()#\\])/g, '$1') // repeat for double-escaped tokens
}

/**
 * Sanitizes URLs to prevent XSS / script execution.
 * Only allows safe relative paths (/app/...) or http/https/mailto.
 */
export function sanitizeUrl(rawUrl = '') {
  const trimmed = String(rawUrl || '').trim()
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null
  }
  return trimmed
}

/**
 * Tokenizes a single line of text into inline formatting tokens.
 */
export function tokenizeInlineContent(text = '') {
  if (text == null) return []
  const cleaned = cleanMarkdownEscapes(text)
  if (!cleaned) return []

  // Token pattern matching:
  // 1. `code`
  // 2. [label](url)
  // 3. **bold**
  // 4. *italic*
  const tokenPattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g
  const parts = cleaned.split(tokenPattern)
  const tokens = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    // 1. Inline code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      tokens.push({
        type: 'code',
        value: part.slice(1, -1),
      })
      continue
    }

    // 2. Markdown links: [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const [, label, rawUrl] = linkMatch
      const safeUrl = sanitizeUrl(rawUrl)
      if (safeUrl) {
        tokens.push({
          type: 'link',
          label,
          url: safeUrl,
          isInternal: safeUrl.startsWith('/'),
        })
      } else {
        tokens.push({
          type: 'text',
          value: label,
        })
      }
      continue
    }

    // 3. Bold text: **bold**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      tokens.push({
        type: 'bold',
        value: part.slice(2, -2),
      })
      continue
    }

    // 4. Italic text: *italic*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      tokens.push({
        type: 'italic',
        value: part.slice(1, -1),
      })
      continue
    }

    // Plain text
    tokens.push({
      type: 'text',
      value: part,
    })
  }

  return tokens
}

/**
 * Parses multi-line assistant message into structured block elements.
 */
export function parseMessageBlocks(content = '') {
  if (!content) return []

  const rawText = String(content)
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
  const lines = rawText.split('\n')
  const blocks = []

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx]
    const trimmed = rawLine.trim()

    // 1. Horizontal dividers
    if (trimmed === '---' || trimmed === '***') {
      blocks.push({ type: 'divider' })
      continue
    }

    // 2. Headings
    if (trimmed.startsWith('### ')) {
      blocks.push({
        type: 'heading',
        level: 3,
        tokens: tokenizeInlineContent(trimmed.slice(4)),
      })
      continue
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({
        type: 'heading',
        level: 2,
        tokens: tokenizeInlineContent(trimmed.slice(3)),
      })
      continue
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({
        type: 'heading',
        level: 1,
        tokens: tokenizeInlineContent(trimmed.slice(2)),
      })
      continue
    }

    // 3. Bullet points (•, -, *)
    const bulletMatch = rawLine.match(/^(\s*)([•\-\*])\s+(.*)$/)
    if (bulletMatch) {
      blocks.push({
        type: 'bullet',
        indent: bulletMatch[1].length,
        tokens: tokenizeInlineContent(bulletMatch[3]),
      })
      continue
    }

    // 4. Numbered list items (1. , 2. )
    const numberMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/)
    if (numberMatch) {
      blocks.push({
        type: 'numbered',
        indent: numberMatch[1].length,
        number: numberMatch[2],
        tokens: tokenizeInlineContent(numberMatch[3]),
      })
      continue
    }

    // 5. Empty line -> spacing
    if (trimmed === '') {
      blocks.push({ type: 'spacing' })
      continue
    }

    // 6. Regular paragraph line
    blocks.push({
      type: 'paragraph',
      tokens: tokenizeInlineContent(rawLine),
    })
  }

  return blocks
}
