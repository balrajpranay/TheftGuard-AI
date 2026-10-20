import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'
import { Spinner } from '../components/ui'
import ChatSidebar from '../components/chat/ChatSidebar'
import ChatComposer from '../components/chat/ChatComposer'
import ChatMessageBubble from '../components/chat/ChatMessageBubble'
import ChatWelcomeScreen from '../components/chat/ChatWelcomeScreen'
import ContextAttachmentBadge from '../components/chat/ContextAttachmentBadge'
import RenameSessionModal from '../components/chat/RenameSessionModal'
import {
  setChatStorageUser,
  loadChatSessions,
  createChatSession,
  saveChatSession,
  deleteChatSession,
  renameChatSession,
  togglePinChatSession,
  detachSessionBillContext,
  clearAllChatSessions,
  deriveSessionTitle,
  addMessageToSession,
  downloadChatSession,
  prepareSessionForRegenerate,
} from '../lib/chatSessionStorage'
import { executeChatTool } from '../lib/chatToolsEngine'
import { chatWithAssistant, DEFAULT_SUGGESTIONS } from '../lib/assistantEngine'
import { getPluginById } from '../lib/assistantPlugins'
import { useLanguage } from '../context/LanguageContext.js'

export default function AIChatWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAuthenticated, isDemoMode, loading: authLoading } = useAuth()
  const { language, t } = useLanguage()
  const currentUserId = isAuthenticated && user?.id ? user.id : null

  const {
    activeBillContext,
    billSlots,
    questionnaireAnswers,
    customers,
    uploaded,
    investigations,
    tariff,
  } = useAppState()

  const [selectedPlugins, setSelectedPlugins] = useState(['general_assistant'])

  function handleTogglePlugin(pluginId) {
    setSelectedPlugins((prev) => {
      if (prev.includes('general_assistant')) {
        return [pluginId]
      }
      if (prev.includes(pluginId)) {
        const next = prev.filter((id) => id !== pluginId)
        return next.length > 0 ? next : ['general_assistant']
      }
      return [...prev, pluginId]
    })
  }

  function handleSelectGeneral() {
    setSelectedPlugins(['general_assistant'])
  }

  const [sessions, setSessions] = useState(() => {
    if (authLoading) return []
    setChatStorageUser(currentUserId)
    return loadChatSessions(currentUserId)
  })
  const [activeSessionId, setActiveSessionId] = useState(() => {
    if (authLoading) return null
    const urlId = searchParams.get('id')
    const existing = loadChatSessions(currentUserId)
    if (urlId && existing.some((s) => s.id === urlId)) {
      return urlId
    }
    if (existing.length > 0) {
      return existing[0].id
    }
    const fresh = createChatSession({ billContext: null }, currentUserId)
    return fresh.id
  })

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [renamingSession, setRenamingSession] = useState(null)
  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)
  const currentRequestIdRef = useRef(0)

  // Reload sessions from storage for the active account
  function refreshSessions() {
    setSessions(loadChatSessions(currentUserId))
  }

  // Account switch & auth loading sync
  useEffect(() => {
    if (authLoading) return

    // Cancel in-flight generation on account change
    currentRequestIdRef.current += 1
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsTyping(false)

    setChatStorageUser(currentUserId)
    const freshSessions = loadChatSessions(currentUserId)
    setSessions(freshSessions)

    const urlId = searchParams.get('id')
    if (urlId && freshSessions.some((s) => s.id === urlId)) {
      setActiveSessionId(urlId)
    } else if (freshSessions.length > 0) {
      setActiveSessionId(freshSessions[0].id)
    } else {
      const fresh = createChatSession({ billContext: null }, currentUserId)
      setSessions([fresh])
      setActiveSessionId(fresh.id)
    }
  }, [currentUserId, authLoading])

  // Active session object
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null
  }, [sessions, activeSessionId])

  // Sync activeSessionId with URL
  useEffect(() => {
    const currentParam = searchParams.get('id')
    if (activeSessionId && currentParam !== activeSessionId) {
      setSearchParams({ id: activeSessionId }, { replace: true })
    }
  }, [activeSessionId, searchParams, setSearchParams])

  // Global keyboard shortcut for New Chat (Ctrl+Shift+O / Alt+N)
  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if (
        (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) ||
        (e.altKey && (e.key === 'N' || e.key === 'n'))
      ) {
        e.preventDefault()
        handleNewChat()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Stop generating response
  function handleStopGeneration() {
    currentRequestIdRef.current += 1
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsTyping(false)
  }

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeSession?.messages, isTyping])

  // Create New Chat (Clean Context Guarantee)
  function handleNewChat() {
    handleStopGeneration()
    const fresh = createChatSession({ billContext: null }, currentUserId)
    refreshSessions()
    setActiveSessionId(fresh.id)
    setMobileSidebarOpen(false)
  }

  // Select a session
  function handleSelectSession(id) {
    handleStopGeneration()
    setActiveSessionId(id)
    setMobileSidebarOpen(false)
  }

  // Pin / Unpin toggle
  function handlePinToggle(id) {
    togglePinChatSession(id, currentUserId)
    refreshSessions()
  }

  // Rename session
  function handleRenameSession(id, newTitle) {
    renameChatSession(id, newTitle, currentUserId)
    refreshSessions()
  }

  // Delete session
  function handleDeleteSession(id) {
    deleteChatSession(id, currentUserId)
    const updated = loadChatSessions(currentUserId)
    setSessions(updated)
    if (activeSessionId === id) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id)
      } else {
        const fresh = createChatSession({ billContext: null }, currentUserId)
        setSessions([fresh])
        setActiveSessionId(fresh.id)
      }
    }
  }

  // Clear all history
  function handleClearAllHistory() {
    clearAllChatSessions(currentUserId)
    const fresh = createChatSession({ billContext: null }, currentUserId)
    setSessions([fresh])
    setActiveSessionId(fresh.id)
    setMobileSidebarOpen(false)
  }

  // Attach context explicitly to current session
  function handleAttachContext(contextToAttach) {
    if (!activeSession) return
    const updated = {
      ...activeSession,
      billContext: contextToAttach,
      updatedAt: new Date().toISOString(),
    }
    saveChatSession(updated, currentUserId)
    refreshSessions()
  }

  // Detach context from current session
  function handleDetachContext() {
    if (!activeSessionId) return
    detachSessionBillContext(activeSessionId, currentUserId)
    refreshSessions()
  }

  // Execute Grounded Application Tool
  async function handleExecuteTool(toolId, params = {}) {
    if (!activeSession || isTyping) return
    const targetSessionId = activeSessionId
    const currentReqId = ++currentRequestIdRef.current

    const toolMeta = {
      compare_bills: 'Compare Bills',
      analyze_household: 'Analyze Household Usage',
      estimate_appliance: 'Estimate Appliance Load',
      explain_bill_changes: 'Explain Bill Changes',
      review_missing_ocr: 'Review Missing OCR Fields',
    }

    const pluginMeta = getPluginById(toolId)
    const toolName = pluginMeta ? pluginMeta.name : toolMeta[toolId] || toolId

    // 1. Add user trigger message
    const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: `Run Tool: ${toolName}`,
      timestamp: new Date().toISOString(),
    }

    let updatedSession = addMessageToSession(targetSessionId, userMsg, currentUserId)
    if (activeSession.title === 'New Conversation') {
      renameChatSession(targetSessionId, `Tool: ${toolName}`, currentUserId)
    }
    refreshSessions()
    setIsTyping(true)

    try {
      const result = await executeChatTool({
        toolId,
        params,
        billContext: activeSession.billContext || activeBillContext,
        questionnaireAnswers,
        billSlots,
        customers,
        uploaded,
        investigations,
        tariff,
        isAuthenticated,
        isDemoMode,
      })

      if (currentReqId !== currentRequestIdRef.current) return

      // If tool attaches verified context, persist it to session
      if (result.attachedContext && !activeSession.billContext) {
        updatedSession = {
          ...updatedSession,
          billContext: result.attachedContext,
          attachedBillContext: result.attachedContext,
        }
      }

      const assistantMsg = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        replyToId: userMsgId,
        content: result.message,
        timestamp: new Date().toISOString(),
        toolId,
        toolStatus: result.status,
        suggestions: result.suggestions || DEFAULT_SUGGESTIONS,
      }

      saveChatSession({
        ...updatedSession,
        messages: [...(updatedSession.messages || []), assistantMsg],
        updatedAt: new Date().toISOString(),
      }, currentUserId)
      refreshSessions()
    } catch (err) {
      if (currentReqId !== currentRequestIdRef.current) return
      const errorMsg = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        replyToId: userMsgId,
        content: `Error executing tool "${toolName}": ${err?.message || 'Unexpected failure'}. Please try again.`,
        timestamp: new Date().toISOString(),
        suggestions: DEFAULT_SUGGESTIONS,
      }
      addMessageToSession(targetSessionId, errorMsg, currentUserId)
      refreshSessions()
    } finally {
      if (currentReqId === currentRequestIdRef.current) {
        setIsTyping(false)
      }
    }
  }

  // Export session to markdown / text
  function handleExportSession(targetId = null, format = 'markdown') {
    const id = targetId || activeSessionId
    if (!id) return
    downloadChatSession(id, format, currentUserId)
  }

  // Regenerate last assistant response
  async function handleRegenerateResponse() {
    if (!activeSessionId || isTyping) return
    const targetSessionId = activeSessionId
    const currentReqId = ++currentRequestIdRef.current
    const resPrepped = prepareSessionForRegenerate(targetSessionId, currentUserId)
    if (!resPrepped || !resPrepped.lastUserPrompt) return

    refreshSessions()
    setIsTyping(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // Prior history excludes the last user turn (which is the prompt being regenerated)
      const priorHistory = (resPrepped.session?.messages || []).slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const res = await chatWithAssistant({
        message: resPrepped.lastUserPrompt,
        billContext: resPrepped.session?.billContext,
        questionnaireAnswers,
        history: priorHistory,
        signal: controller.signal,
        activePlugins: selectedPlugins,
        language,
      })

      if (currentReqId !== currentRequestIdRef.current) return

      const lastUserMsg = (resPrepped.session?.messages || []).slice(-1)[0]
      const assistantMsg = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        replyToId: lastUserMsg?.id,
        content: res.reply,
        timestamp: new Date().toISOString(),
        provider: res.provider,
        structured_analysis: res.structured_analysis,
        suggestions: res.suggestions && res.suggestions.length > 0 ? res.suggestions : DEFAULT_SUGGESTIONS,
      }

      addMessageToSession(targetSessionId, assistantMsg, currentUserId)
      refreshSessions()
    } catch (err) {
      if (currentReqId !== currentRequestIdRef.current) return
      if (err?.code === 'cancelled' || err?.name === 'AbortError') {
        const cancelledMsg = {
          id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: '_Response generation was stopped._',
          timestamp: new Date().toISOString(),
          suggestions: DEFAULT_SUGGESTIONS,
        }
        addMessageToSession(targetSessionId, cancelledMsg, currentUserId)
        refreshSessions()
        return
      }
      const fallbackMsg = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: 'I encountered an issue processing your question. Please try asking in a different way or choose a topic from the suggestions below.',
        timestamp: new Date().toISOString(),
        suggestions: DEFAULT_SUGGESTIONS,
      }
      addMessageToSession(targetSessionId, fallbackMsg, currentUserId)
      refreshSessions()
    } finally {
      if (currentReqId === currentRequestIdRef.current) {
        setIsTyping(false)
        abortControllerRef.current = null
      }
    }
  }

  // Send Ordinary User Message
  async function handleSendMessage(userText) {
    if (!userText.trim() || !activeSession || isTyping) return

    const trimmed = userText.trim()
    const targetSessionId = activeSessionId
    const currentReqId = ++currentRequestIdRef.current

    // Snapshot PRIOR history BEFORE adding user message to state/storage
    const priorHistory = (activeSession.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Add user message
    const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }

    let currentSess = addMessageToSession(targetSessionId, userMsg, currentUserId)

    // Auto-derive title if still default
    if (activeSession.title === 'New Conversation') {
      const derived = deriveSessionTitle(trimmed)
      renameChatSession(targetSessionId, derived, currentUserId)
    }

    refreshSessions()
    setIsTyping(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await chatWithAssistant({
        message: trimmed,
        billContext: activeSession.billContext,
        questionnaireAnswers,
        history: priorHistory,
        signal: controller.signal,
        activePlugins: selectedPlugins,
        language,
      })

      if (currentReqId !== currentRequestIdRef.current) return

      const assistantMsg = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        replyToId: userMsgId,
        content: res.reply,
        timestamp: new Date().toISOString(),
        provider: res.provider,
        structured_analysis: res.structured_analysis,
        suggestions: res.suggestions && res.suggestions.length > 0 ? res.suggestions : DEFAULT_SUGGESTIONS,
      }

      addMessageToSession(targetSessionId, assistantMsg, currentUserId)
      refreshSessions()
    } catch (err) {
      if (currentReqId !== currentRequestIdRef.current) return
      if (err?.code === 'cancelled' || err?.name === 'AbortError') {
        const cancelledMsg = {
          id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          replyToId: userMsgId,
          content: '_Response generation was stopped._',
          timestamp: new Date().toISOString(),
          suggestions: DEFAULT_SUGGESTIONS,
        }
        addMessageToSession(targetSessionId, cancelledMsg, currentUserId)
        refreshSessions()
        return
      }
      const fallbackMsg = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        replyToId: userMsgId,
        content: 'I encountered an issue processing your question. Please try asking in a different way or choose a topic from the suggestions below.',
        timestamp: new Date().toISOString(),
        suggestions: DEFAULT_SUGGESTIONS,
      }
      addMessageToSession(targetSessionId, fallbackMsg, currentUserId)
      refreshSessions()
    } finally {
      if (currentReqId === currentRequestIdRef.current) {
        setIsTyping(false)
        abortControllerRef.current = null
      }
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-[calc(100vh-8.5rem)] min-h-[580px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Spinner label="Loading conversation history..." />
      </div>
    )
  }

  const messages = activeSession?.messages || []
  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf('assistant')

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[580px] w-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:block w-72 shrink-0 h-full">
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onPinToggle={handlePinToggle}
          onRenameSession={handleRenameSession}
          onExportSession={handleExportSession}
          onDeleteSession={handleDeleteSession}
          onClearAllHistory={handleClearAllHistory}
        />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-ink/50 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[80vw] h-full bg-white shadow-2xl z-10">
            <ChatSidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onPinToggle={handlePinToggle}
              onRenameSession={handleRenameSession}
              onExportSession={handleExportSession}
              onDeleteSession={handleDeleteSession}
              onClearAllHistory={handleClearAllHistory}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Chat Panel */}
      <div className="flex min-w-0 flex-1 flex-col h-full bg-mist/30">
        {/* Top Header Bar */}
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Toggle conversation history"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold text-ink font-bold text-xs">
                ⚡
              </span>
              <h1 className="text-sm font-semibold text-ink truncate">
                {activeSession?.title || 'New Conversation'}
              </h1>
              {activeSession && (
                <button
                  type="button"
                  onClick={() => setRenamingSession(activeSession)}
                  className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  title="Rename Conversation"
                >
                  <Icon name="edit" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExportSession(activeSessionId, 'markdown')}
              disabled={!activeSession || messages.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-gold hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Export conversation to Markdown file"
            >
              <Icon name="download" className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <Link
              to="/app/bill-comparison"
              className="hidden sm:flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-gold hover:text-ink transition-colors"
              title="Open Bill Comparison Page"
            >
              <Icon name="file" className="h-3.5 w-3.5 text-slate-400" />
              <span>Bill Comparison</span>
            </Link>
          </div>
        </header>

        {/* Attached Context Notice Strip */}
        <div className="px-4 py-2 border-b border-slate-200 bg-white/70">
          <ContextAttachmentBadge
            attachedContext={activeSession?.billContext}
            availableAppContext={activeBillContext}
            onAttachContext={handleAttachContext}
            onDetachContext={handleDetachContext}
          />
        </div>

        {/* Conversation Message List or Welcome Screen */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.length === 0 ? (
              <ChatWelcomeScreen
                availableBillContext={activeBillContext}
                onAttachContext={handleAttachContext}
                onSelectPrompt={handleSendMessage}
              />
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <ChatMessageBubble
                    key={msg.id}
                    message={msg}
                    isLatestAssistant={idx === lastAssistantIndex}
                    onRegenerate={handleRegenerateResponse}
                    onSelectSuggestion={handleSendMessage}
                  />
                ))}

                {isTyping && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-gold border border-gold/40 shadow-xs">
                      <span className="text-xs font-bold">⚡</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl bg-white border border-slate-200 px-4 py-3 shadow-2xs">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gold" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gold [animation-delay:0.2s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gold [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Multiline Composer */}
        <ChatComposer
          onSendMessage={handleSendMessage}
          onExecuteTool={handleExecuteTool}
          onStopGeneration={handleStopGeneration}
          loading={isTyping}
          selectedPlugins={selectedPlugins}
          onTogglePlugin={handleTogglePlugin}
          onSelectGeneral={handleSelectGeneral}
        />
      </div>

      {/* Rename Modal */}
      <RenameSessionModal
        isOpen={Boolean(renamingSession)}
        initialTitle={renamingSession?.title}
        onSave={(newTitle) => {
          if (renamingSession) {
            handleRenameSession(renamingSession.id, newTitle)
            setRenamingSession(null)
          }
        }}
        onClose={() => setRenamingSession(null)}
      />
    </div>
  )
}
