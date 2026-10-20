import { useState, useRef, useEffect } from 'react'
import Icon from '../Icon'

export default function ChatSessionItem({
  session,
  isActive,
  onSelect,
  onPinToggle,
  onRename,
  onExport,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const hasBill = Boolean(session.billContext && session.billContext.has_bills)

  return (
    <div
      className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer ${
        isActive
          ? 'bg-ink text-white font-medium shadow-xs'
          : 'text-ink/80 hover:bg-slate-200/60'
      }`}
      onClick={onSelect}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-1">
        <Icon
          name={session.pinned ? 'pin' : 'chat'}
          className={`h-4 w-4 shrink-0 ${
            session.pinned
              ? 'text-gold fill-gold/20'
              : isActive
              ? 'text-gold'
              : 'text-ink/50 group-hover:text-ink/75'
          }`}
        />
        <span className="truncate text-xs sm:text-sm" title={session.title}>
          {session.title || 'New conversation'}
        </span>
        {hasBill && (
          <span
            className={`shrink-0 rounded px-1 py-0.2 text-[10px] font-semibold ${
              isActive
                ? 'bg-gold/20 text-gold border border-gold/40'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}
            title="Attached Bill Context"
          >
            Bill
          </span>
        )}
      </div>

      <div className="relative shrink-0" ref={menuRef} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className={`rounded p-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 ${
            isActive ? 'text-white/80 hover:bg-white/10' : 'text-ink/60 hover:bg-slate-300/60'
          } ${menuOpen ? 'opacity-100' : ''}`}
          aria-label="Conversation options"
        >
          <Icon name="dots" className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-7 z-30 w-36 rounded-md border border-slate-200 bg-white py-1 shadow-lg text-ink text-xs">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onPinToggle(session.id)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left"
            >
              <Icon name="pin" className="h-3.5 w-3.5 text-slate-500" />
              <span>{session.pinned ? 'Unpin' : 'Pin to top'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onRename(session)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left"
            >
              <Icon name="edit" className="h-3.5 w-3.5 text-slate-500" />
              <span>Rename</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                if (onExport) onExport(session.id)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left"
            >
              <Icon name="download" className="h-3.5 w-3.5 text-slate-500" />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onDelete(session.id)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600 text-left"
            >
              <Icon name="trash" className="h-3.5 w-3.5 text-red-500" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
