/**
 * TheftGuard AI — Settings & Preferences Page
 *
 * Allows users to:
 * - View account identity, email, and authentication/demo status.
 * - Change the active interface language between English, Hindi (हिन्दी), and Telugu (తెలుగు).
 * - Changes take effect immediately and are persisted per user/account.
 * - Provides clear feedback upon updating preferences.
 * - Explains account isolation and local privacy guarantees.
 */

import React, { useState } from 'react'
import { Panel, Badge, Notice } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../context/AuthContext.js'
import { useLanguage } from '../context/LanguageContext.js'

export default function Settings() {
  const { user, isAuthenticated, isDemoMode } = useAuth()
  const { language, setLanguage, supportedLanguages, t } = useLanguage()
  const [saveAlert, setSaveAlert] = useState(false)

  const handleLanguageSelect = (code) => {
    setLanguage(code)
    setSaveAlert(true)
    setTimeout(() => {
      setSaveAlert(false)
    }, 4000)
  }

  const fullName = user?.user_metadata?.full_name || (isDemoMode ? 'Demo Operator' : 'Utility Operator')
  const email = user?.email || (isDemoMode ? 'demo@utility.internal' : '—')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {t('settings.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t('settings.subtitle')}
        </p>
      </div>

      {saveAlert && (
        <Notice tone="ok" title={t('settings.languageUpdated')} className="animate-in fade-in duration-200">
          {t('settings.languagePersistenceNote')}
        </Notice>
      )}

      {/* Language Preferences Panel */}
      <Panel
        title={t('settings.languageSection')}
        subtitle={t('settings.languageDescription')}
      >
        <div className="p-4 sm:p-6 space-y-4">
          <div
            role="radiogroup"
            aria-label={t('settings.languageSection')}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {supportedLanguages.map((item) => {
              const isSelected = language === item.code
              let desc = t('settings.englishDesc')
              if (item.code === 'hi') desc = t('settings.hindiDesc')
              if (item.code === 'te') desc = t('settings.teluguDesc')

              return (
                <button
                  key={item.code}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleLanguageSelect(item.code)}
                  className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-gold bg-amber-50/80 shadow-xs ring-2 ring-gold/50'
                      : 'border-line bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-base font-bold ${isSelected ? 'text-amber-950' : 'text-ink'}`}>
                        {item.nativeName}
                      </span>
                      {isSelected ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-ink font-bold text-xs shadow-2xs">
                          ✓
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {item.code}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-slate-600">
                      {item.label}
                    </p>
                    <p className="mt-2 text-xs text-muted leading-relaxed">
                      {desc}
                    </p>
                  </div>

                  <div className="mt-4 pt-2 border-t border-line/60 flex items-center justify-between text-[11px]">
                    <span className={isSelected ? 'font-bold text-amber-900' : 'text-muted'}>
                      {isSelected ? t('common.active') : t('common.selectLanguage')}
                    </span>
                    <span className="text-slate-400">&rarr;</span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="rounded-lg bg-slate-50 border border-line p-3 text-xs text-muted flex items-start gap-2">
            <Icon name="info" className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
            <p>
              {t('settings.languagePersistenceNote')}
            </p>
          </div>
        </div>
      </Panel>

      {/* Account & Session Panel */}
      <Panel
        title={t('settings.accountSection')}
        subtitle="Current session identity and access clearance."
      >
        <div className="divide-y divide-line p-4 sm:p-6 text-sm">
          <div className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <span className="font-medium text-muted">{t('settings.fullName')}</span>
            <span className="font-semibold text-ink">{fullName}</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <span className="font-medium text-muted">{t('settings.email')}</span>
            <span className="font-mono text-xs sm:text-sm text-ink">{email}</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <span className="font-medium text-muted">{t('settings.sessionType')}</span>
            <div>
              {isAuthenticated ? (
                <Badge tone="ok">{t('common.authenticated')}</Badge>
              ) : isDemoMode ? (
                <Badge tone="gold">{t('common.demoMode')}</Badge>
              ) : (
                <Badge tone="grey">Guest</Badge>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* Privacy & Account Isolation Panel */}
      <Panel
        title={t('settings.privacySection')}
        subtitle={t('settings.storageNotice')}
      >
        <div className="p-4 sm:p-6 text-xs text-muted leading-relaxed space-y-2">
          <p>{t('settings.privacyNote')}</p>
          <p>
            Language preferences, cached spot-billing extractions, and AI chat logs remain strictly isolated per user account.
          </p>
        </div>
      </Panel>
    </div>
  )
}
