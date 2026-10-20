import { useState, useEffect, useRef } from 'react'
import Icon from '../Icon'

export default function RenameSessionModal({
  isOpen,
  initialTitle,
  onSave,
  onClose,
}) {
  const [title, setTitle] = useState(initialTitle || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle || '')
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 50)
    }
  }, [isOpen, initialTitle])

  if (!isOpen) return null

  function handleSubmit(e) {
    e.preventDefault()
    if (title.trim()) {
      onSave(title.trim())
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs">
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-modal-title"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 id="rename-modal-title" className="text-sm font-semibold text-ink flex items-center gap-2">
            <Icon name="edit" className="h-4 w-4 text-slate-500" />
            Rename Conversation
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4">
          <label htmlFor="conversation-title-input" className="block text-xs font-medium text-slate-600 mb-1">
            Conversation Title
          </label>
          <input
            id="conversation-title-input"
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink placeholder-slate-400 focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
            placeholder="e.g. July Bill Variance Analysis"
          />
          <div className="mt-1 text-right text-[11px] text-slate-400">
            {title.length} / 60
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded-md bg-gold px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-[#E0B220] disabled:opacity-50 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
