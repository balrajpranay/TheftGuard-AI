import React from 'react'
import { Link } from 'react-router-dom'
import { parseMessageBlocks } from '../lib/formatAssistantMessage.js'

function renderTokens(tokens = []) {
  return tokens.map((token, index) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong key={index} className="font-semibold text-ink">
            {token.value}
          </strong>
        )
      case 'italic':
        return (
          <em key={index} className="italic text-muted">
            {token.value}
          </em>
        )
      case 'code':
        return (
          <code
            key={index}
            className="rounded bg-mist/60 px-1 py-0.5 font-mono text-[11px] text-ink font-semibold"
          >
            {token.value}
          </code>
        )
      case 'link':
        if (token.isInternal) {
          return (
            <Link
              key={index}
              to={token.url}
              className="font-semibold text-ink underline decoration-gold hover:text-gold-deep transition-colors"
            >
              {token.label}
            </Link>
          )
        }
        return (
          <a
            key={index}
            href={token.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline decoration-gold hover:text-gold-deep transition-colors"
          >
            {token.label}
          </a>
        )
      case 'text':
      default:
        return <React.Fragment key={index}>{token.value}</React.Fragment>
    }
  })
}

/**
 * Safely renders formatted assistant responses without raw HTML injection or escaped markdown remnants.
 */
export default function FormattedAssistantMessage({ content = '', className = '' }) {
  if (!content) return null

  const blocks = parseMessageBlocks(content)

  return (
    <div className={`space-y-0.5 text-xs text-ink ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'divider':
            return <hr key={idx} className="my-2.5 border-t border-line/60" />

          case 'heading':
            if (block.level === 1) {
              return (
                <h2 key={idx} className="font-bold text-ink text-sm mt-3 mb-1.5">
                  {renderTokens(block.tokens)}
                </h2>
              )
            }
            if (block.level === 2) {
              return (
                <h3 key={idx} className="font-bold text-ink text-xs mt-3 mb-1">
                  {renderTokens(block.tokens)}
                </h3>
              )
            }
            return (
              <h4 key={idx} className="font-bold text-ink text-xs mt-2.5 mb-1">
                {renderTokens(block.tokens)}
              </h4>
            )

          case 'bullet':
            return (
              <div
                key={idx}
                className={`flex items-start gap-1.5 my-0.5 ${block.indent > 0 ? 'pl-4' : 'pl-0.5'}`}
              >
                <span className="text-gold font-bold select-none text-[11px] leading-tight shrink-0 mt-0.5">
                  •
                </span>
                <div className="flex-1 leading-relaxed text-xs">
                  {renderTokens(block.tokens)}
                </div>
              </div>
            )

          case 'numbered':
            return (
              <div
                key={idx}
                className={`flex items-start gap-1.5 my-0.5 ${block.indent > 0 ? 'pl-4' : 'pl-0.5'}`}
              >
                <span className="font-bold text-ink select-none text-[11px] leading-tight shrink-0 min-w-[16px] text-right">
                  {block.number}.
                </span>
                <div className="flex-1 leading-relaxed text-xs">
                  {renderTokens(block.tokens)}
                </div>
              </div>
            )

          case 'spacing':
            return <div key={idx} className="h-1.5" />

          case 'paragraph':
          default:
            return (
              <p key={idx} className="my-0.5 leading-relaxed text-xs">
                {renderTokens(block.tokens)}
              </p>
            )
        }
      })}
    </div>
  )
}
