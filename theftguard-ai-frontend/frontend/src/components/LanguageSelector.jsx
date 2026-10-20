/**
 * TheftGuard AI — Language Selector Component
 *
 * Renders an accessible, responsive language selector supporting English, Hindi (हिन्दी), and Telugu (తెలుగు).
 * Can be rendered as:
 * - 'compact': Minimal button/menu with globe icon, suitable for navigation bars and headers.
 * - 'pills': Interactive segmented pills, suitable for Settings and modal preference panels.
 * - 'dropdown': Native accessible select element, suitable for forms (e.g. registration form).
 */

import React, { useState, useRef, useEffect } from 'react'
import Icon from './Icon'
import { useLanguage } from '../context/LanguageContext.js'

export default function LanguageSelector({
  variant = 'compact',
  className = '',
  id = 'language-selector',
  ariaLabel = null,
}) {
  const { language, setLanguage, supportedLanguages, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  const effectiveAriaLabel = ariaLabel || t('common.selectLanguage')

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (variant === 'pills') {
    return (
      <div
        role="radiogroup"
        aria-label={effectiveAriaLabel}
        className={`grid grid-cols-1 gap-2.5 sm:grid-cols-3 ${className}`}
      >
        {supportedLanguages.map((item) => {
          const isSelected = language === item.code
          return (
            <button
              key={item.code}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setLanguage(item.code)}
              className={`flex flex-col items-start rounded-lg border p-3.5 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-gold bg-amber-50/70 shadow-xs ring-1 ring-gold/40'
                  : 'border-line bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`text-sm font-bold ${isSelected ? 'text-ink' : 'text-slate-800'}`}>
                  {item.nativeName}
                </span>
                {isSelected ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-ink font-bold text-xs">
                    ✓
                  </span>
                ) : null}
              </div>
              <span className="mt-0.5 text-xs text-muted">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  if (variant === 'dropdown') {
    return (
      <div className={`relative ${className}`}>
        <select
          id={id}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label={effectiveAriaLabel}
          className="w-full rounded border border-line bg-white px-3 py-2 text-sm font-medium text-ink shadow-xs focus:border-gold focus:outline-hidden focus:ring-1 focus:ring-gold cursor-pointer"
        >
          {supportedLanguages.map((item) => (
            <option key={item.code} value={item.code}>
              {item.nativeName} ({item.label})
            </option>
          ))}
        </select>
      </div>
    )
  }

  // Default 'compact' variant
  const currentLangMeta = supportedLanguages.find((l) => l.code === language) || supportedLanguages[0]

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('common.language')}: ${currentLangMeta.nativeName}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <Icon name="globe" className="h-3.5 w-3.5 text-slate-500" />
        <span>{currentLangMeta.nativeName}</span>
        <Icon name="chevRight" className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-50 mt-1 w-36 origin-top-right rounded-lg border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 focus:outline-hidden"
        >
          {supportedLanguages.map((item) => {
            const isSelected = language === item.code
            return (
              <button
                key={item.code}
                role="menuitem"
                type="button"
                onClick={() => {
                  setLanguage(item.code)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-50 text-ink font-semibold'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-ink'
                }`}
              >
                <span>{item.nativeName}</span>
                <span className="text-[10px] text-muted">{item.code.toUpperCase()}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
