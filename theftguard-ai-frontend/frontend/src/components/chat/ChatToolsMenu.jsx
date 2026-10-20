import { useEffect, useRef } from 'react'
import Icon from '../Icon'
import { ASSISTANT_PLUGINS } from '../../lib/assistantPlugins'

export default function ChatToolsMenu({
  isOpen,
  onClose,
  onSelectTool,
}) {
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="absolute bottom-16 left-0 z-40 w-88 max-w-[92vw] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/5 max-h-[70vh] overflow-y-auto"
      role="menu"
      aria-label="Application Tools"
    >
      <div className="px-3 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Grounded Assistant Plugins & Tools
        </span>
        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
          Zero-Hallucination
        </span>
      </div>

      <div className="space-y-1">
        {ASSISTANT_PLUGINS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              onClose()
              onSelectTool(tool.id)
            }}
            className="flex w-full items-start gap-2.5 rounded-xl p-2 text-left hover:bg-slate-100/80 transition-colors group cursor-pointer"
            role="menuitem"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-gold/20 group-hover:text-ink transition-colors">
              <Icon name={tool.icon || 'tool'} className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-ink group-hover:text-black truncate">
                  {tool.name}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-slate-500 group-hover:text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded">
                  {tool.badge}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 leading-tight">
                {tool.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
