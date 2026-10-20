import { useState, useMemo } from 'react'
import Icon from '../Icon'
import ChatSessionItem from './ChatSessionItem'
import RenameSessionModal from './RenameSessionModal'
import {
  groupSessionsByDate,
  searchChatSessions,
} from '../../lib/chatSessionStorage'

const GROUP_LABELS = {
  pinned: 'Pinned',
  today: 'Today',
  yesterday: 'Yesterday',
  last7Days: 'Previous 7 Days',
  older: 'Older',
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onPinToggle,
  onRenameSession,
  onExportSession,
  onDeleteSession,
  onClearAllHistory,
  onCloseMobile,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [renamingSession, setRenamingSession] = useState(null)

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    return searchChatSessions(sessions, searchQuery)
  }, [sessions, searchQuery])

  const grouped = useMemo(() => {
    return groupSessionsByDate(filteredSessions)
  }, [filteredSessions])

  const hasAnySessions = sessions && sessions.length > 0

  function handleSaveRename(newTitle) {
    if (renamingSession) {
      onRenameSession(renamingSession.id, newTitle)
      setRenamingSession(null)
    }
  }

  function handleConfirmClear() {
    if (
      window.confirm(
        'Are you sure you want to delete all chat history for this account? This will permanently remove all stored conversations for the current account from this browser.'
      )
    ) {
      onClearAllHistory()
    }
  }

  return (
    <aside className="flex h-full w-full flex-col bg-slate-50 border-r border-slate-200 select-none">
      {/* Top Header & New Chat */}
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gold text-ink font-bold text-xs">
              ⚡
            </span>
            <span className="font-semibold text-xs text-ink tracking-wide uppercase">
              Conversations
            </span>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden rounded p-1 text-slate-500 hover:bg-slate-200"
              aria-label="Close sidebar"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-ink/90 active:scale-[0.99] transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Icon name="plus" className="h-4 w-4 text-gold" />
            <span>New Chat</span>
          </div>
          <span className="text-[10px] text-white/50 font-normal hidden sm:inline" title="Keyboard Shortcut">
            Ctrl+Shift+O
          </span>
        </button>

        {/* Search */}
        {hasAnySessions && (
          <div className="relative mt-2">
            <Icon
              name="search"
              className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-ink placeholder-slate-400 focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grouped Session List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {!hasAnySessions ? (
          <div className="px-3 py-8 text-center text-xs text-slate-400">
            <p className="font-medium text-slate-600">No conversations yet</p>
            <p className="mt-1">Start a new chat to ask questions or analyze your electricity bill.</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-slate-400">
            <p>No conversations match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        ) : (
          ['pinned', 'today', 'yesterday', 'last7Days', 'older'].map((groupKey) => {
            const list = grouped[groupKey] || []
            if (list.length === 0) return null
            return (
              <div key={groupKey} className="space-y-1">
                <div className="px-2 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {GROUP_LABELS[groupKey]}
                </div>
                {list.map((sess) => (
                  <ChatSessionItem
                    key={sess.id}
                    session={sess}
                    isActive={sess.id === activeSessionId}
                    onSelect={() => {
                      onSelectSession(sess.id)
                      if (onCloseMobile) onCloseMobile()
                    }}
                    onPinToggle={onPinToggle}
                    onRename={(s) => setRenamingSession(s)}
                    onExport={(id) => onExportSession && onExportSession(id)}
                    onDelete={onDeleteSession}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Footer / Privacy note & Clear All */}
      <div className="border-t border-slate-200 p-2.5 bg-slate-100/60 text-[11px] text-slate-500">
        <div className="flex items-center justify-between">
          <span className="truncate" title="Conversations are saved locally in this browser, separated per account. Not synced to a server.">
            🔒 Local account storage
          </span>
          {hasAnySessions && (
            <button
              type="button"
              onClick={handleConfirmClear}
              className="text-red-600 hover:text-red-700 hover:underline shrink-0 text-[11px]"
              title="Delete all stored chat conversations for this account"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Rename Modal */}
      <RenameSessionModal
        isOpen={Boolean(renamingSession)}
        initialTitle={renamingSession?.title}
        onSave={handleSaveRename}
        onClose={() => setRenamingSession(null)}
      />
    </aside>
  )
}
