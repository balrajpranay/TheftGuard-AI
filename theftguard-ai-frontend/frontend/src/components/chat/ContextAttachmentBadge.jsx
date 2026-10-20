import Icon from '../Icon'
import { kwh } from '../../lib/format'

export default function ContextAttachmentBadge({
  attachedContext,
  availableAppContext,
  onAttachContext,
  onDetachContext,
}) {
  const hasAttached = Boolean(attachedContext && attachedContext.has_bills)
  const hasAvailable = Boolean(
    availableAppContext &&
      availableAppContext.has_bills &&
      (availableAppContext.prev_units != null || availableAppContext.curr_units != null)
  )

  if (hasAttached) {
    const prev = attachedContext.prev_units != null ? kwh(attachedContext.prev_units) : 'N/A'
    const curr = attachedContext.curr_units != null ? kwh(attachedContext.curr_units) : 'N/A'
    const delta =
      attachedContext.delta_units != null
        ? `${attachedContext.delta_units >= 0 ? '+' : ''}${attachedContext.delta_units} kWh`
        : null

    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-1.5 text-xs text-amber-900 shadow-2xs">
        <div className="flex items-center gap-2 truncate">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 text-[11px] font-bold">
            ⚡
          </span>
          <span className="truncate">
            <strong>Attached Bill Context:</strong> Prev {prev} &rarr; Curr {curr}
            {delta ? ` (${delta})` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onDetachContext}
          className="shrink-0 flex items-center gap-1 rounded bg-white/80 px-2 py-0.5 text-[11px] font-medium text-amber-900 border border-amber-300 hover:bg-amber-100 hover:text-red-700 transition-colors cursor-pointer"
          title="Detach bill data from this conversation"
        >
          <Icon name="close" className="h-3 w-3" />
          <span>Detach</span>
        </button>
      </div>
    )
  }

  if (hasAvailable) {
    const prev = availableAppContext.prev_units != null ? kwh(availableAppContext.prev_units) : 'N/A'
    const curr = availableAppContext.curr_units != null ? kwh(availableAppContext.curr_units) : 'N/A'

    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-1.5 text-xs text-slate-700">
        <div className="flex items-center gap-2 truncate">
          <Icon name="file" className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">
            Bill data loaded in workspace ({prev} &rarr; {curr})
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAttachContext(availableAppContext)}
          className="shrink-0 flex items-center gap-1 rounded bg-gold/90 px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-gold transition-colors cursor-pointer shadow-2xs"
          title="Attach current bill data to this chat session"
        >
          <span>⚡ Attach to Chat</span>
        </button>
      </div>
    )
  }

  return null
}
