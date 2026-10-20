import { useMemo } from 'react'
import Icon from '../Icon'
import { ASSISTANT_PLUGINS } from '../../lib/assistantPlugins'

export default function ChatPluginSelector({
  selectedPlugins = ['general_assistant'],
  onTogglePlugin,
  onSelectGeneral,
  onExecutePlugin,
  disabled = false,
}) {
  const isGeneralActive =
    selectedPlugins.includes('general_assistant') || selectedPlugins.length === 0

  const specializedCount = useMemo(() => {
    return isGeneralActive ? 0 : selectedPlugins.length
  }, [selectedPlugins, isGeneralActive])

  return (
    <div className="mb-2.5 px-0.5" role="region" aria-label="Assistant Plugins">
      <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-slate-600">
          <Icon name="sparkles" className="h-3.5 w-3.5 text-gold shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Assistant Plugins
          </span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold transition-colors ${
              isGeneralActive
                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}
          >
            {isGeneralActive ? 'General Mode' : `${specializedCount} Active`}
          </span>
        </div>

        <div className="text-[11px] text-slate-400 hidden sm:block">
          Select one or more plugins, or click <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.2 font-mono text-[9px]">Run</kbd> to execute
        </div>
      </div>

      {/* Horizontally scrollable chip row */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth">
        {/* General Assistant Chip */}
        <button
          type="button"
          disabled={disabled}
          onClick={onSelectGeneral}
          className={`group flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs transition-all cursor-pointer select-none active:scale-95 min-h-[36px] ${
            isGeneralActive
              ? 'border-amber-400 bg-amber-50 font-semibold text-amber-900 shadow-2xs ring-1 ring-amber-300'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          }`}
          title="General Assistant: Default comprehensive Q&A, navigation, and energy concepts"
          aria-pressed={isGeneralActive}
        >
          <Icon
            name="chat"
            className={`h-3.5 w-3.5 transition-colors ${
              isGeneralActive ? 'text-amber-700' : 'text-slate-400 group-hover:text-slate-600'
            }`}
          />
          <span>General Assistant</span>
          {isGeneralActive && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          )}
        </button>

        {/* Specialized Plugins */}
        {ASSISTANT_PLUGINS.filter((p) => !p.isDefault).map((plugin) => {
          const isSelected = !isGeneralActive && selectedPlugins.includes(plugin.id)

          return (
            <div
              key={plugin.id}
              className={`group inline-flex shrink-0 items-center rounded-xl border transition-all select-none ${
                isSelected
                  ? 'border-gold bg-gold/15 text-ink shadow-2xs ring-1 ring-gold/40'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {/* Toggle selection button */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onTogglePlugin(plugin.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer focus:outline-hidden min-h-[36px]"
                title={`${plugin.name}: ${plugin.description} (Click to toggle)`}
                aria-pressed={isSelected}
              >
                <Icon
                  name={plugin.icon}
                  className={`h-3.5 w-3.5 transition-colors ${
                    isSelected ? 'text-amber-800' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span className={isSelected ? 'font-semibold text-ink' : 'font-normal'}>
                  {plugin.name}
                </span>
                {isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                )}
              </button>

              {/* Quick Execute action button */}
              {onExecutePlugin && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation()
                    onExecutePlugin(plugin.id)
                  }}
                  className={`flex items-center justify-center border-l px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer focus:outline-hidden min-h-[36px] min-w-[32px] ${
                    isSelected
                      ? 'border-gold/30 text-amber-900 hover:bg-gold/30 hover:text-black'
                      : 'border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  title={`Run ${plugin.name} tool now`}
                  aria-label={`Run ${plugin.name} tool`}
                >
                  <span className="hidden sm:inline">Run</span>
                  <Icon name="arrowRight" className="h-2.5 w-2.5 sm:ml-0.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
