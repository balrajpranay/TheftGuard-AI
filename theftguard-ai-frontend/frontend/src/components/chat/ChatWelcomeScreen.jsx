import Icon from '../Icon'
import { kwh } from '../../lib/format'
import { useLanguage } from '../../context/LanguageContext.js'

function getSuggestionCards(lang) {
  if (lang === 'hi') {
    return [
      {
        title: 'LLM क्या है?',
        description: 'लार्ज लैंग्वेज मॉडल कैसे काम करते हैं और AI उत्तर कैसे बनाता है।',
        prompt: 'LLM क्या है?',
        icon: 'sparkles',
      },
      {
        title: 'बिल इतना ज़्यादा क्यों आया?',
        description: 'टैरिफ स्लैब, बिलिंग अवधि और मौसमी लोड में बदलाव को समझें।',
        prompt: 'इस महीने मेरा बिजली का बिल इतना ज़्यादा क्यों आया?',
        icon: 'bill',
      },
      {
        title: 'AC बिजली खपत का अनुमान',
        description: '1.5 टन BEE 3-स्टार इन्वर्टर एसी की दैनिक और मासिक खपत जानें।',
        prompt: '1.5 टन एसी 4 घंटे में कितनी बिजली खर्च करता है?',
        icon: 'model',
      },
      {
        title: 'टैरिफ स्लैब कैसे काम करते हैं?',
        description: 'जानें कि यूनिट्स बढ़ने पर ऊंची दरों में बिल कैसे बढ़ता है।',
        prompt: 'टैरिफ स्लैब कैसे काम करते हैं?',
        icon: 'compare',
      },
      {
        title: 'kWh का क्या मतलब है?',
        description: 'किलोवाट-घंटे और बिजली मापने की आधिकारिक इकाई की सरल व्याख्या।',
        prompt: 'kWh का क्या मतलब होता है?',
        icon: 'info',
      },
      {
        title: 'मीटर रीडिंग की जांच',
        description: 'मीटर की रीडिंग और बिल पर दर्ज यूनिट्स की जांच कैसे करें।',
        prompt: 'मैं कैसे जांचूं कि मेरी मीटर रीडिंग सही है?',
        icon: 'clipboard',
      },
    ]
  }
  if (lang === 'te') {
    return [
      {
        title: 'LLM అంటే ఏమిటి?',
        description: 'లార్జ్ లాంగ్వేజ్ మోడల్స్ ఎలా పనిచేస్తాయి మరియు సమాధానాలు ఎలా ఇస్తాయి.',
        prompt: 'LLM అంటే ఏమిటి?',
        icon: 'sparkles',
      },
      {
        title: 'కరెంట్ బిల్లు ఎందుకు ఎక్కువ వచ్చింది?',
        description: 'టారిఫ్ స్లాబ్‌లు, బిల్లింగ్ రోజులు మరియు వేసవి వాడకం ప్రభావం.',
        prompt: 'ఈ నెల నా కరెంట్ బిల్లు ఎందుకు ఎక్కువ వచ్చింది?',
        icon: 'bill',
      },
      {
        title: 'ఏసీ కరెంట్ వాడకం అంచనా',
        description: '1.5 టన్ ఇన్వర్టర్ ఏసీకి రోజువారీ మరియు నెలవారీ కరెంట్ ఖర్చు.',
        prompt: '1.5 టన్ ఏసీ 4 గంటలు నడిస్తే ఎంత కరెంట్ ఖర్చవుతుంది?',
        icon: 'model',
      },
      {
        title: 'టారిఫ్ స్లాబ్‌లు ఎలా పనిచేస్తాయి?',
        description: 'యూనిట్లు పెరిగే కొద్దీ రేటు ఎలా పెరుగుతుందో సులభంగా తెలుసుకోండి.',
        prompt: 'టారిఫ్ స్లాబ్‌లు ఎలా పనిచేస్తాయి?',
        icon: 'compare',
      },
      {
        title: 'kWh అంటే ఏమిటి?',
        description: 'కిలోవాట్-అవర్ అంటే ఏమిటి మరియు కరెంట్ యూనిట్లను ఎలా కొలుస్తారు.',
        prompt: 'kWh అంటే ఏమిటి?',
        icon: 'info',
      },
      {
        title: 'మీటర్ రీడింగ్ తనిఖీ',
        description: 'మీ ఇంట్లోని మీటర్ రీడింగ్ బిల్లుతో సరిపోలుతుందో లేదో చూడడం ఎలా.',
        prompt: 'నా మీటర్ రీడింగ్ సరిగ్గా ఉందో లేదో ఎలా చెక్ చేయాలి?',
        icon: 'clipboard',
      },
    ]
  }
  return [
    {
      title: 'What is an LLM?',
      description: 'Understand Large Language Models, how they generate responses, and how AI works.',
      prompt: 'What is an LLM?',
      icon: 'sparkles',
    },
    {
      title: 'Why is my electricity bill so high?',
      description: 'Explore tariff slab tiers, billing cycle lengths, and seasonal load factors.',
      prompt: 'Why is my electricity bill so high this month?',
      icon: 'bill',
    },
    {
      title: 'Estimate AC Power Consumption',
      description: 'Calculate daily and monthly energy for 1.5 Ton BEE 3-Star inverter cooling.',
      prompt: 'How much electricity does an AC use in 4 hours?',
      icon: 'model',
    },
    {
      title: 'How do tariff slabs work?',
      description: 'Learn why incremental units step into higher brackets under telescopic pricing.',
      prompt: 'How do tariff slabs work?',
      icon: 'compare',
    },
    {
      title: 'What does kWh mean?',
      description: 'Clear explanation of kilowatt-hours and how electricity is officially measured.',
      prompt: 'What does kWh mean?',
      icon: 'info',
    },
    {
      title: 'Check meter dial accuracy',
      description: 'Steps to verify physical meter numbers against spot-billing readings.',
      prompt: 'How can I check if my meter reading is accurate?',
      icon: 'clipboard',
    },
  ]
}

export default function ChatWelcomeScreen({
  availableBillContext,
  onAttachContext,
  onSelectPrompt,
}) {
  const { language, t } = useLanguage()
  const suggestionCards = getSuggestionCards(language)

  const hasAvailableBills = Boolean(
    availableBillContext &&
      availableBillContext.has_bills &&
      (availableBillContext.prev_units != null || availableBillContext.curr_units != null)
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-4 py-8 text-center sm:py-12">
      {/* Brand Icon & Heading */}
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-ink text-xl font-bold shadow-md">
        ⚡
      </div>

      <h1 className="mt-4 text-xl sm:text-2xl font-bold text-ink">
        {t('chat.workspaceTitle')}
      </h1>

      <p className="mt-2 max-w-lg text-xs sm:text-sm text-slate-600 leading-relaxed">
        {t('chat.workspaceSubtitle')}
      </p>

      {/* Available Bill Attachment Banner */}
      {hasAvailableBills && (
        <div className="mt-6 w-full max-w-xl rounded-xl border border-gold/60 bg-amber-50/80 p-3.5 text-left shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-ink font-bold text-[11px]">
                  ⚡
                </span>
                <span className="text-xs font-bold text-amber-950">
                  {t('chat.activeBillDetected')}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-amber-900/80">
                Found {kwh(availableBillContext.prev_units)} &rarr; {kwh(availableBillContext.curr_units)}. Attach to this session to enable in-depth bill difference breakdown.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAttachContext(availableBillContext)}
              className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink hover:bg-[#E0B220] transition-colors shadow-2xs cursor-pointer min-h-[36px]"
            >
              {t('chat.attachContext')}
            </button>
          </div>
        </div>
      )}

      {/* Trust & Privacy Badges */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
          <Icon name="check" className="h-3 w-3 text-emerald-600" />
          {t('chat.groundedBadge', 'Grounded Responses')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
          <Icon name="check" className="h-3 w-3 text-emerald-600" />
          {t('chat.beeBadge', 'BEE 3-Star Standards')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
          <Icon name="check" className="h-3 w-3 text-emerald-600" />
          {t('chat.localStorageBadge', 'Local Browser Storage Only')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
          <Icon name="check" className="h-3 w-3 text-emerald-600" />
          {t('chat.limitationsBadge', 'Transparent Limitations')}
        </span>
      </div>

      {/* Suggested Starting Questions */}
      <div className="mt-8 w-full text-left">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          {t('chat.suggestedQuestions', 'Suggested Questions')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {suggestionCards.map((card, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectPrompt(card.prompt)}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-gold hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-gold/20 group-hover:text-ink transition-colors">
                <Icon name={card.icon} className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ink group-hover:text-black">
                  {card.title}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                  {card.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
