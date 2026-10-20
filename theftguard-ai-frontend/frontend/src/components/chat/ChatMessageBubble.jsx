import { useState } from 'react'
import Icon from '../Icon'
import FormattedAssistantMessage from '../FormattedAssistantMessage'

export default function ChatMessageBubble({
  message,
  isLatestAssistant = false,
  onRegenerate = null,
  onSelectSuggestion = null,
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const timeString = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={`flex w-full gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}>
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-gold border border-gold/40 shadow-xs mt-0.5">
          <span className="text-xs font-bold">⚡</span>
        </div>
      )}

      {/* Bubble Content */}
      <div
        className={`relative text-sm leading-relaxed ${
          isUser
            ? 'max-w-xl rounded-2xl rounded-tr-xs bg-ink text-white px-4 py-3 shadow-xs'
            : 'w-full max-w-2xl rounded-2xl rounded-tl-xs bg-white border border-slate-200/80 p-4 sm:p-5 shadow-xs text-ink'
        }`}
      >
        {/* Tool execution badge if present */}
        {message.toolId && (
          <div className="mb-2.5 flex items-center gap-1.5 text-xs text-slate-500 pb-2 border-b border-slate-100">
            <Icon name="tool" className="h-3.5 w-3.5 text-gold" />
            <span className="font-semibold text-slate-700">Tool Executed:</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
              {message.toolId.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        {/* Message body */}
        <div className="break-words">
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <FormattedAssistantMessage content={message.content} />
          )}
        </div>

        {/* Footer: timestamp & actions */}
        <div
          className={`mt-3 flex items-center justify-between gap-2 pt-2 border-t text-[11px] ${
            isUser ? 'border-white/10 text-white/60' : 'border-slate-100 text-slate-400'
          }`}
        >
          <span>{timeString}</span>

          <div className="flex items-center gap-2">
            {!isUser && isLatestAssistant && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-ink transition-colors cursor-pointer"
                title="Regenerate this response"
              >
                <Icon name="refresh" className="h-3 w-3" />
                <span>Regenerate</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
                isUser
                  ? 'hover:bg-white/10 hover:text-white'
                  : 'hover:bg-slate-100 hover:text-slate-700'
              }`}
              title="Copy message to clipboard"
            >
              {copied ? (
                <>
                  <Icon name="check" className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Icon name="copy" className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Suggested questions under assistant message */}
        {!isUser && message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3.5 pt-2.5 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1">
              <Icon name="sparkles" className="h-3 w-3 text-gold" />
              <span>Suggested Follow-ups:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectSuggestion && onSelectSuggestion(sug)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-gold hover:bg-gold/10 hover:text-ink transition-colors cursor-pointer text-left"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold text-xs mt-0.5">
          👤
        </div>
      )}
    </div>
  )
}
