import { useState, useRef, useEffect } from 'react'
import Icon from '../Icon'
import ChatToolsMenu from './ChatToolsMenu'

const MAX_MESSAGE_LENGTH = 1500

export default function ChatComposer({
  onSendMessage,
  onExecuteTool,
  onStopGeneration = null,
  loading = false,
  disabled = false,
  placeholder = 'Ask a question about your electricity bill, appliance load, or tariff slabs...',
}) {
  const [text, setText] = useState('')
  const [toolsOpen, setToolsOpen] = useState(false)
  const textareaRef = useRef(null)

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      const newHeight = Math.min(el.scrollHeight, 180)
      el.style.height = `${Math.max(44, newHeight)}px`
    }
  }, [text])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'Escape' && toolsOpen) {
      setToolsOpen(false)
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || loading || disabled) return
    onSendMessage(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px'
      textareaRef.current.focus()
    }
  }

  return (
    <div className="relative border-t border-slate-200/80 bg-white/95 backdrop-blur-xs p-3 sm:p-4 transition-all">
      <div className="mx-auto max-w-3xl">
        <div className="relative">
          <ChatToolsMenu
            isOpen={toolsOpen}
            onClose={() => setToolsOpen(false)}
            onSelectTool={(toolId) => {
              onExecuteTool(toolId)
            }}
          />

          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-xs focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/30 transition-all">
            {/* Tools Menu Trigger Button */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setToolsOpen((prev) => !prev)}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  toolsOpen
                    ? 'border-gold bg-gold text-ink shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-ink hover:border-slate-300'
                }`}
                title="Application Tools (Compare Bills, Household Profile, Appliance Load...)"
                aria-label="Open Tools Menu"
                aria-haspopup="menu"
                aria-expanded={toolsOpen}
              >
                <Icon name="tool" className="h-4 w-4" />
              </button>
            </div>

            {/* Text Area */}
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={loading || disabled}
                className="w-full resize-none border-0 bg-transparent py-2 px-1 text-sm text-ink placeholder-slate-400 focus:outline-hidden focus:ring-0 disabled:opacity-50 leading-relaxed max-h-44"
              />
            </div>

            {/* Action Controls: Char Count, Stop, or Send */}
            <div className="flex items-center gap-2 shrink-0 pb-1">
              {text.length > 200 && (
                <span
                  className={`text-[10px] tabular-nums ${
                    text.length > 1400 ? 'text-red-600 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {text.length} / {MAX_MESSAGE_LENGTH}
                </span>
              )}

              {loading ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 active:scale-95 transition-all cursor-pointer shadow-2xs shrink-0"
                  title="Stop generating response"
                  aria-label="Stop generating response"
                >
                  <Icon name="stop" className="h-3 w-3 text-red-600" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!text.trim() || disabled}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold text-ink hover:bg-[#E0B220] active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer shadow-xs shrink-0"
                  title="Send Message (Enter)"
                  aria-label="Send Message"
                >
                  <Icon name="send" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom helper row */}
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>
              Press <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.2 font-mono text-[10px]">Enter</kbd> to send, <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.2 font-mono text-[10px]">Shift+Enter</kbd> for newline
            </span>
            <button
              type="button"
              onClick={() => setToolsOpen(true)}
              className="text-slate-500 hover:text-ink hover:underline cursor-pointer flex items-center gap-1"
            >
              <Icon name="sparkles" className="h-3 w-3 text-gold" />
              <span>Grounded Tools</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
