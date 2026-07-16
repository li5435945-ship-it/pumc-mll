import React from 'react'

/**
 * Pre-process markdown text to fix common streaming issues:
 * 1. Remove trailing unclosed ** markers
 * 2. Clean up orphaned opening ** at end of line
 */
function cleanMarkdown(text: string): string {
  // Count total ** markers
  const boldMarkers = (text.match(/\*\*/g) || []).length

  // If odd number of **, the last one is unclosed — remove it
  if (boldMarkers % 2 !== 0) {
    // Find last ** and remove it
    const lastIdx = text.lastIndexOf('**')
    if (lastIdx !== -1) {
      text = text.slice(0, lastIdx) + text.slice(lastIdx + 2)
    }
  }

  return text
}

/**
 * Simple markdown-to-JSX renderer.
 * Supports: **bold**, *italic*, \n line breaks, ## headings
 */
export function renderMarkdown(text: string): React.ReactNode[] {
  if (!text) return []

  // Pre-clean the text to handle streaming edge cases
  text = cleanMarkdown(text)

  const lines = text.split('\n')
  const result: React.ReactNode[] = []

  lines.forEach((line, lineIdx) => {
    // Process inline markdown
    const parts: React.ReactNode[] = []
    let remaining = line
    let key = 0

    // Headings ## or ###
    if (remaining.startsWith('### ')) {
      result.push(<h4 key={`h-${lineIdx}`} style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 600 }}>{remaining.slice(4)}</h4>)
      return
    }
    if (remaining.startsWith('## ')) {
      result.push(<h3 key={`h-${lineIdx}`} style={{ margin: '12px 0 6px', fontSize: 15, fontWeight: 600 }}>{remaining.slice(3)}</h3>)
      return
    }
    if (remaining.startsWith('# ')) {
      result.push(<h2 key={`h-${lineIdx}`} style={{ margin: '12px 0 6px', fontSize: 16, fontWeight: 600 }}>{remaining.slice(2)}</h2>)
      return
    }

    // Inline bold and italic
    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      // Italic: *text* (not **)
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/)

      let firstMatch: { type: 'bold' | 'italic'; index: number; length: number; content: string } | null = null

      if (boldMatch && boldMatch.index !== undefined) {
        firstMatch = { type: 'bold', index: boldMatch.index, length: boldMatch[0].length, content: boldMatch[1] }
      }
      if (italicMatch && italicMatch.index !== undefined) {
        if (!firstMatch || italicMatch.index < firstMatch.index) {
          firstMatch = { type: 'italic', index: italicMatch.index, length: italicMatch[0].length, content: italicMatch[1] }
        }
      }

      if (firstMatch) {
        // Text before the match
        if (firstMatch.index > 0) {
          parts.push(<span key={key++}>{remaining.slice(0, firstMatch.index)}</span>)
        }
        // The formatted text
        if (firstMatch.type === 'bold') {
          parts.push(<strong key={key++}>{firstMatch.content}</strong>)
        } else {
          parts.push(<em key={key++}>{firstMatch.content}</em>)
        }
        remaining = remaining.slice(firstMatch.index + firstMatch.length)
      } else {
        // No more matches
        parts.push(<span key={key++}>{remaining}</span>)
        remaining = ''
      }
    }

    result.push(<React.Fragment key={`line-${lineIdx}`}>{parts}{lineIdx < lines.length - 1 && <br />}</React.Fragment>)
  })

  return result
}
