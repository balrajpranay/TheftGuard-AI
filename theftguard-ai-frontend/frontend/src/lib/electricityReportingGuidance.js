/**
 * TheftGuard AI - Telangana Electricity Reporting & Consumer Guidance Module
 *
 * Provides verified official guidance for reporting electricity issues in Telangana:
 * - Official DISCOM Identification: TGSPDCL (South) vs TGNPDCL (North)
 * - Statewide 24x7 Toll-Free Consumer Helpline: 1912
 * - Official Portals and Mobile Applications
 * - Required Information & Documents Checklist (USC, meter serial, LCD Screen 2, spot bills)
 * - Post-Submission Complaint Lifecycle (Docket number, AE field inspection, MRT testing, billing rectification)
 * - Polite, Non-Accusatory Draft Complaint Generator
 * - Mandatory Disclaimers: Draft only (not submitted automatically), local contacts verification via 1912/spot bill,
 *   never touching live wires/poles, and non-accusatory neutral framing (scores/differences are NOT proof of theft).
 *
 * Supported Languages: English ('en'), Hindi ('hi'), Telugu ('te')
 */

export const TELANGANA_DISCOMS = {
  TGSPDCL: {
    id: 'TGSPDCL',
    name: 'Southern Power Distribution Company of Telangana Limited (TGSPDCL)',
    shortName: 'TGSPDCL',
    teluguName: 'తెలంగాణ దక్షిణ ప్రాంత విద్యుత్ పంపిణీ సంస్థ (TGSPDCL)',
    hindiName: 'तेलंगाना दक्षिणी विद्युत वितरण कंपनी लिमिटेड (TGSPDCL)',
    tollFree: '1912',
    portalUrl: 'https://tgspdcl.cgg.gov.in',
    mobileApp: 'TGSPDCL',
    headquarters: 'Mint Compound, Hyderabad',
    districts: [
      'hyderabad',
      'secunderabad',
      'ranga reddy',
      'rangareddy',
      'medchal-malkajgiri',
      'medchal',
      'malkajgiri',
      'mahabubnagar',
      'nalgonda',
      'sangareddy',
      'medak',
      'siddipet',
      'vikarabad',
      'suryapet',
      'yadadri bhuvanagiri',
      'yadadri',
      'bhuvanagiri',
      'wanaparthy',
      'nagarkurnool',
      'jogulamba gadwal',
      'gadwal',
      'narayanpet',
    ],
  },
  TGNPDCL: {
    id: 'TGNPDCL',
    name: 'Northern Power Distribution Company of Telangana Limited (TGNPDCL)',
    shortName: 'TGNPDCL',
    teluguName: 'తెలంగాణ ఉత్తర ప్రాంత విద్యుత్ పంపిణీ సంస్థ (TGNPDCL)',
    hindiName: 'तेलंगाना उत्तरी विद्युत वितरण कंपनी लिमिटेड (TGNPDCL)',
    tollFree: '1912',
    portalUrl: 'https://tgnpdcl.com',
    mobileApp: 'TGNPDCL',
    headquarters: 'Nakkalagutta, Hanumakonda / Warangal',
    districts: [
      'warangal',
      'hanumakonda',
      'karimnagar',
      'khammam',
      'nizamabad',
      'adilabad',
      'bhadradri kothagudem',
      'kothagudem',
      'jagtial',
      'jangaon',
      'jayashankar bhupalpally',
      'bhupalpally',
      'kamareddy',
      'komaram bheem asifabad',
      'asifabad',
      'mahabubabad',
      'mancherial',
      'mulugu',
      'nirmal',
      'peddapalli',
      'rajanna sircilla',
      'sircilla',
    ],
  },
}

/**
 * Identifies the distribution company based on free-form district or location text.
 * Returns the DISCOM config object if recognized, or null if ambiguous/unspecified.
 */
export function identifyDiscomByLocation(text) {
  if (!text || typeof text !== 'string') return null
  const clean = text.toLowerCase()

  // Explicit DISCOM mentions
  if (clean.includes('tgspdcl') || clean.includes('tsspdcl') || clean.includes('south')) {
    return TELANGANA_DISCOMS.TGSPDCL
  }
  if (clean.includes('tgnpdcl') || clean.includes('tsnpdcl') || clean.includes('north')) {
    return TELANGANA_DISCOMS.TGNPDCL
  }

  // Check TGSPDCL districts
  for (const d of TELANGANA_DISCOMS.TGSPDCL.districts) {
    const regex = new RegExp(`\\b${d.replace('-', '[- ]')}\\b`, 'i')
    if (regex.test(clean)) {
      return TELANGANA_DISCOMS.TGSPDCL
    }
  }

  // Check TGNPDCL districts
  for (const d of TELANGANA_DISCOMS.TGNPDCL.districts) {
    const regex = new RegExp(`\\b${d.replace('-', '[- ]')}\\b`, 'i')
    if (regex.test(clean)) {
      return TELANGANA_DISCOMS.TGNPDCL
    }
  }

  return null
}

/**
 * 1. Guidance on how to report and which department/DISCOM to contact.
 */
export function buildReportingOverview({ location = null, language = 'en' } = {}) {
  const discom = identifyDiscomByLocation(location)

  if (language === 'te') {
    let reply = `### తెలంగాణలో విద్యుత్ సమస్యలు మరియు ఫిర్యాదుల నమోదు మార్గదర్శకాలు\n\n`
    reply += `తెలంగాణ రాష్ట్రంలో విద్యుత్ సరఫరా, మీటర్ లోపాలు, రీడింగ్ తప్పులు, లేదా అనుమానాస్పద అక్రమాలను నమోదు చేయడానికి అధికారిక మార్గాలు:\n\n`
    reply += `• **కేంద్ర టోల్‌ఫ్రీ హెల్ప్‌లైన్: 1912** (తెలంగాణ మొత్తం 24 గంటలు పనిచేస్తుంది).\n`

    if (discom) {
      reply += `• **మీ అధికారిక డిస్కౌం (DISCOM)**: **${discom.teluguName}**\n`
      reply += `  - వెబ్‌సైట్: **${discom.portalUrl}**\n`
      reply += `  - మొబైల్ యాప్: **${discom.mobileApp}**\n`
      reply += `  - ప్రధాన కార్యాలయం: ${discom.headquarters}\n\n`
    } else {
      reply += `• **తెలంగాణలో రెండు అధికారిక విద్యుత్ పంపిణీ సంస్థలు ఉన్నాయి**:\n`
      reply += `  1. **TGSPDCL (దక్షిణ ప్రాంతం)**: హైదరాబాద్, రంగారెడ్డి, మేడ్చల్, మహబూబ్‌నగర్, నల్గొండ, మెదక్, సిద్దిపేట, సంగారెడ్డి, సూర్యాపేట, వికారాబాద్ తదితర జిల్లాలు. (వెబ్‌సైట్: https://tgspdcl.cgg.gov.in)\n`
      reply += `  2. **TGNPDCL (ఉత్తర ప్రాంతం)**: వరంగల్, హనుమకొండ, కరీంనగర్, ఖమ్మం, నిజామాబాద్, ఆదిలాబాద్, జగిత్యాల, మంచిర్యాల తదితర జిల్లాలు. (వెబ్‌సైట్: https://tgnpdcl.com)\n\n`
      reply += `*(మీరు ఏ జిల్లా లేదా పట్టణంలో ఉన్నారో తెలియజేస్తే, మీ పరిధిలోని ఖచ్చితమైన విద్యుత్ సంస్థ వివరాలను అందించగలను. మీ నెలవారీ స్పాట్ బిల్లు పైభాగంలో కూడా మీ డిస్కౌం పేరు ముద్రించబడి ఉంటుంది.)*\n\n`
    }

    reply += `**అధికారికంగా ఫిర్యాదు చేయడానికి 3 మార్గాలు:**\n`
    reply += `1. **1912 కు కాల్ చేయడం**: ఏ ఫోన్ నుండైనా 1912 కు కాల్ చేసి ఫిర్యాదు నమోదు చేయవచ్చు; వెంటనే డాకెట్ నంబర్ ఎస్ఎంఎస్ వస్తుంది.\n`
    reply += `2. **మొబైల్ యాప్ / అధికారిక పోర్టల్**: ఆన్‌లైన్‌లో కస్టమర్ సర్వీస్ ద్వారా మీటర్ రీడింగ్ ఫోటోతో ఫిర్యాదు సమర్పించవచ్చు.\n`
    reply += `3. **స్థానిక సెక్షన్ ఆఫీస్ (AE / Operations)**: మీ ప్రాంత విద్యుత్ సబ్-స్టేషన్ లేదా సెక్షన్ ఆఫీసులో లిఖితపూర్వకంగా దరఖాస్తు ఇవ్వవచ్చు.\n\n`
    reply += `⚠️ **గమనిక & భద్రత**:\n`
    reply += `• స్థానిక లైన్‌మన్ లేదా అధికారుల వ్యక్తిగత ఫోన్ నంబర్లు తరచూ మారుతుంటాయి. మీ స్పాట్ బిల్లుపై 'ERO / Section' వద్ద ముద్రించిన అధికారిక నంబరును తనిఖీ చేయండి లేదా 1912 ద్వారా ధృవీకరించుకోండి.\n`
    reply += `• కరెంట్ తీగలు, సర్వీస్ వైర్లు లేదా మీటర్‌ను ఎట్టిపరిస్థితుల్లో తాకవద్దు. ఎల్లప్పుడూ సురక్షితమైన దూరం నుంచే పరిశీలించండి.`

    return {
      reply,
      suggestions: [
        'ఫిర్యాదు కోసం ఏ పత్రాలు కావాలి?',
        'ఫిర్యాదు చేసిన తర్వాత ఏమి జరుగుతుంది?',
        'ఫిర్యాదు లేఖ రాయడానికి సహాయం చేయండి',
        'నా జిల్లా హైదరాబాద్ (TGSPDCL)',
      ],
    }
  }

  if (language === 'hi') {
    let reply = `### तेलंगाना में बिजली संबंधी समस्या की शिकायत कैसे करें?\n\n`
    reply += `तेलंगाना में बिजली आपूर्ति, मीटर खराबी, रीडिंग में त्रुटि या संदिग्ध विसंगतियों की आधिकारिक शिकायत के मुख्य माध्यम:\n\n`
    reply += `• **केंद्रीकृत 24x7 टोल-फ्री हेल्पलाइन: 1912** (पूरे तेलंगाना में मान्य)।\n`

    if (discom) {
      reply += `• **आपकी आधिकारिक वितरण कंपनी**: **${discom.hindiName}**\n`
      reply += `  - आधिकारिक पोर्टल: **${discom.portalUrl}**\n`
      reply += `  - मोबाइल ऐप: **${discom.mobileApp}**\n`
      reply += `  - मुख्यालय: ${discom.headquarters}\n\n`
    } else {
      reply += `• **तेलंगाना में दो डिस्कॉम (DISCOM) कार्यरत हैं**:\n`
      reply += `  1. **TGSPDCL (दक्षिणी क्षेत्र)**: हैदराबाद, रंगारेड्डी, मेडचल, महबूबनगर, नलगोंडा, संगारेड्डी, सिद्दीपेट आदि। (वेबसाइट: https://tgspdcl.cgg.gov.in)\n`
      reply += `  2. **TGNPDCL (उत्तरी क्षेत्र)**: वारंगल, हनुमकोंडा, करीमनगर, खम्मम, निजामाबाद, आदिलाबाद आदि। (वेबसाइट: https://tgnpdcl.com)\n\n`
      reply += `*(यदि आप अपना जिला या शहर बताएं, तो मैं सटीक डिस्कॉम की जानकारी दे सकता हूँ। आपके स्पॉट बिल की रसीद पर भी डिस्कॉम का नाम दर्ज होता है।)*\n\n`
    }

    reply += `**शिकायत दर्ज करने के 3 आधिकारिक तरीके:**\n`
    reply += `1. **1912 पर कॉल करें**: किसी भी फोन से 1912 डायल करें; शिकायत दर्ज होते ही एसएमएस द्वारा डॉकेट नंबर मिलेगा।\n`
    reply += `2. **मोबाइल ऐप या डिस्कॉम वेबसाइट**: मीटर रीडिंग के फोटो के साथ ऑनलाइन शिकायत दर्ज करें।\n`
    reply += `3. **स्थानीय सेक्शन कार्यालय (AE / Operations)**: अपने नजदीकी सब-स्टेशन में लिखित आवेदन जमा करें।\n\n`
    reply += `⚠️ **महत्वपूर्ण सूचना व सुरक्षा**:\n`
    reply += `• स्थानीय लाइनमैन या उप-अभियंता के व्यक्तिगत फोन नंबर बदलते रहते हैं। अपने स्पॉट बिल पर मुद्रित ERO/सेक्शन नंबर देखें या 1912 से सत्यापित करें।\n`
    reply += `• कभी भी बिजली के तारों, पोल या मीटर को स्वयं न छुएं। हमेशा सुरक्षित दूरी बनाए रखें।`

    return {
      reply,
      suggestions: [
        'शिकायत के लिए कौन से दस्तावेज चाहिए?',
        'शिकायत के बाद क्या प्रक्रिया होती है?',
        'शिकायत पत्र का प्रारूप तैयार करें',
        'मेरा जिला हैदराबाद (TGSPDCL) है',
      ],
    }
  }

  // English default
  let reply = `### How to Report a Suspected Electricity Issue in Telangana\n\n`
  reply += `In Telangana, consumer billing disputes, suspected meter faults, sparks, or service line irregularities are handled through official, verified channels:\n\n`
  reply += `• **Statewide 24x7 Toll-Free Consumer Helpline**: **1912** (accessible across all districts in Telangana).\n`

  if (discom) {
    reply += `• **Your Official Distribution Utility**: **${discom.name}**\n`
    reply += `  - Official Web Portal: **${discom.portalUrl}**\n`
    reply += `  - Mobile App: **${discom.mobileApp}**\n`
    reply += `  - Operating Headquarters: ${discom.headquarters}\n\n`
  } else {
    reply += `• **Distribution Utilities by Region**:\n`
    reply += `  1. **TGSPDCL (Southern Telangana)**: Serves Hyderabad, Ranga Reddy, Medchal-Malkajgiri, Mahabubnagar, Nalgonda, Sangareddy, Medak, Siddipet, Vikarabad, Suryapet, etc. (*Portal: https://tgspdcl.cgg.gov.in*)\n`
    reply += `  2. **TGNPDCL (Northern Telangana)**: Serves Warangal, Hanumakonda, Karimnagar, Khammam, Nizamabad, Adilabad, Bhadradri Kothagudem, Jagtial, Mancherial, etc. (*Portal: https://tgnpdcl.com*)\n\n`
    reply += `*(Tell me your district or town if you would like me to confirm your exact DISCOM. Your utility name and section code are also printed at the top of your monthly spot bill receipt.)*\n\n`
  }

  reply += `**3 Verified Submission Channels:**\n`
  reply += `1. **Phone (Helpline 1912)**: Call 1912 to register an official grievance with an agent; an SMS tracking docket number is issued immediately.\n`
  reply += `2. **Digital (DISCOM Mobile App / Web Portal)**: Submit a service request under the "Consumer Grievances / Meter Verification" section with photos.\n`
  reply += `3. **Physical (Section Office / ERO)**: Submit a written letter to the Assistant Engineer (AE / Operations) at your local distribution section office.\n\n`
  reply += `⚠️ **Verified Contacts & Safety Rules**:\n`
  reply += `• **Do not rely on unverified phone numbers**: Individual line-staff numbers change frequently. Look at the "ERO / Section Phone" printed on your physical spot bill receipt or call 1912 for the authorized officer.\n`
  reply += `• **Electrical Safety**: Never touch meters, live wires, service cables, or distribution poles. Conduct observations from a safe distance.`

  return {
    reply,
    suggestions: [
      'What information and documents should I prepare?',
      'What happens after I submit a complaint?',
      'Can you help me write a clear complaint?',
      'My location is Hyderabad (TGSPDCL)',
    ],
  }
}

/**
 * 2. Information and Documents Checklist.
 */
export function buildRequiredInformationChecklist({ billContext = null, language = 'en' } = {}) {
  const uscText = billContext && billContext.consumer_number
    ? ` (Your active bill lists USC: **${billContext.consumer_number}**)`
    : ''

  if (language === 'te') {
    return {
      reply:
        `### విద్యుత్ ఫిర్యాదు నమోదుకు అవసరమైన సమాచారం & పత్రాల చెక్‌లిస్ట్\n\n` +
        `ఫిర్యాదు త్వరగా పరిష్కారం కావడానికి క్రింది వివరాలను సిద్ధం చేసుకోండి:\n\n` +
        `1. **USC (యునిక్ సర్వీస్ నంబర్) / కన్స్యూమర్ నంబర్**${uscText}:\n` +
        `   - మీ స్పాట్ బిల్లు రసీదుపై పైన స్పష్టంగా ముద్రించబడి ఉంటుంది. మీ కనెక్షన్‌ను గుర్తించడానికి ఇది చాలా ముఖ్యం.\n\n` +
        `2. **మీటర్ రీడింగ్ & మీటర్ నంబర్**:\n` +
        `   - మీటర్ పెట్టెపై ఉన్న సీరియల్ నంబర్.\n` +
        `   - మీటర్ LCD స్క్రీన్ 2 పై కనిపించే ప్రస్తుత క్యుములేటివ్ రీడింగ్ (**kWh**), మరియు స్క్రీన్ 1 లోని తేదీ.\n\n` +
        `3. **తాజా విద్యుత్ బిల్లుల రసీదులు**:\n` +
        `   - గత 1 నుండి 3 నెలల స్పాట్ బిల్లు కాపీలు (రీడింగ్ తేడా లేదా అకస్మాత్తుగా పెరిగిన యూనిట్లను నిరూపించడానికి).\n\n` +
        `4. **చిరునామా & సరఫరా వివరాలు**:\n` +
        `   - మీ పూర్తి ఇంటి నంబరు, వీధి, సమీప ల్యాండ్‌మార్క్, మరియు బయట ఉన్న విద్యుత్ స్తంభం (పోల్) నంబరు.\n\n` +
        `5. **సురక్షితమైన ఫోటోలు (సురక్షిత దూరం నుండి మాత్రమే)**:\n` +
        `   - మీటర్ డిస్ప్లే రీడింగ్ స్పష్టంగా కనిపించే ఫోటో.\n` +
        `   - మీటర్ సీల్ లేదా వైరింగ్ వద్ద ఏదైనా కాలిపోయిన లేదా లోపభూయిష్ట భాగం ఉంటే తీసిన ఫోటో.\n\n` +
        `⚡ **ఖచ్చితమైన భద్రతా హెచ్చరిక**:\n` +
        `ఎట్టిపరిస్థితుల్లోనూ లైవ్ వైర్లు, మీటర్ టెర్మినల్స్ లేదా విద్యుత్ స్తంభాలను తాకవద్దు. పరిశీలనలు మరియు ఫోటోలను కేవలం సురక్షితమైన దూరం నుంచే తీయండి.`,
      suggestions: [
        'ఫిర్యాదు చేసిన తర్వాత ఏమి జరుగుతుంది?',
        'ఫిర్యాదు లేఖ రాయడానికి సహాయం చేయండి',
        'తెలంగాణ విద్యుత్ హెల్ప్‌లైన్ నంబర్ ఎంత?',
      ],
    }
  }

  if (language === 'hi') {
    return {
      reply:
        `### बिजली शिकायत दर्ज करने हेतु आवश्यक जानकारी एवं दस्तावेज चेकलिस्ट\n\n` +
        `शिकायत के त्वरित निवारण के लिए निम्नलिखित विवरण तैयार रखें:\n\n` +
        `1. **USC (यूनिक सर्विस नंबर) / उपभोक्ता संख्या**${uscText}:\n` +
        `   - यह आपके मासिक स्पॉट बिल की रसीद पर सबसे ऊपर लिखा होता है।\n\n` +
        `2. **मीटर विवरण एवं वर्तमान रीडिंग**:\n` +
        `   - मीटर की प्लेट पर अंकित सीरियल नंबर।\n` +
        `   - डिजिटल LCD डिस्प्ले की स्क्रीन 2 पर दिखने वाली वर्तमान संचयी रीडिंग (**kWh**) और स्क्रीन 1 की तारीख।\n\n` +
        `3. **हालिया बिजली बिल की रसीदें**:\n` +
        `   - पिछले 1 से 3 महीनों के स्पॉट बिल की प्रतियां (रीडिंग अंतर या अप्रत्याशित वृद्धि दिखाने हेतु)।\n\n` +
        `4. **पता एवं पोल विवरण**:\n` +
        `   - मकान संख्या, मोहल्ला, नजदीकी लैंडमार्क, तथा संभव हो तो बाहर लगे बिजली पोल का नंबर।\n\n` +
        `5. **स्पष्ट फोटोग्राफ (केवल सुरक्षित दूरी से)**:\n` +
        `   - मीटर की स्क्रीन 2 पर दिख रही वास्तविक रीडिंग का फोटो।\n` +
        `   - मीटर सील या टर्मिनल पर यदि कोई भौतिक क्षति या स्पार्क हो, तो उसका फोटो।\n\n` +
        `⚡ **अनिवार्य सुरक्षा चेतावनी**:\n` +
        `बिजली के तारों, खंभों या मीटर के हिस्सों को कभी भी न छुएं। हमेशा उचित दूरी बनाए रखकर ही जांच करें।`,
      suggestions: [
        'शिकायत के बाद क्या प्रक्रिया होती है?',
        'शिकायत पत्र का प्रारूप तैयार करें',
        'कौन सा बिजली विभाग संपर्क करें?',
      ],
    }
  }

  return {
    reply:
      `### Information & Documents to Prepare for an Official Electricity Grievance\n\n` +
      `Having accurate records ensures prompt departmental dispatch and avoids duplicate inspection fees:\n\n` +
      `1. **Unique Service Number (USC) / Consumer Number**${uscText}:\n` +
      `   - Printed at the top of your monthly spot bill receipt (essential for locating your distribution transformer and billing ledger).\n\n` +
      `2. **Physical Meter Dial Reading & Serial Number**:\n` +
      `   - The physical serial number stamped on the meter casing plate.\n` +
      `   - Current cumulative energy reading from **Screen 2 (Cumulative kWh)** and timestamp from **Screen 1 (Date)**.\n\n` +
      `3. **Recent Spot Bill Receipts**:\n` +
      `   - Hard copy or digital image of your 1–3 most recent bills to demonstrate historical baseline vs the billed entry discrepancy.\n\n` +
      `4. **Location & Supply Identifiers**:\n` +
      `   - Full door address, landmark, and the distribution pole number (stenciled in yellow/black on the pole outside).\n\n` +
      `5. **Clear Photographs (Taken Safely)**:\n` +
      `   - A legible photograph of the physical LCD dial showing cumulative units.\n` +
      `   - Photographs of any burnt terminals, broken seals, or physical wire anomalies.\n\n` +
      `⚡ **Crucial Safety Warning**:\n` +
      `Never touch meter terminals, service wires, overhead lines, or distribution poles. Take photographs only from a safe standing distance.`,
    suggestions: [
      'What happens after I submit a complaint?',
      'Can you help me write a clear complaint?',
      'Which official electricity department should I contact?',
    ],
  }
}

/**
 * 3. Complaint Lifecycle & What Happens After Submission.
 */
export function buildComplaintLifecycleExplanation({ language = 'en' } = {}) {
  if (language === 'te') {
    return {
      reply:
        `### ఫిర్యాదు సమర్పించిన తర్వాత అధికారిక ప్రక్రియ ఏమిటి?\n\n` +
        `తెలంగాణ విద్యుత్ సరఫరా కోడ్ (Supply Code) నిబంధనల ప్రకారం ఫిర్యాదు నమోదు తర్వాత జరిగే దశలు:\n\n` +
        `1. **డాకెట్ నంబర్ (Docket Number) జారీ**:\n` +
        `   - ఫిర్యాదు నమోదైన వెంటనే మీకు SMS ద్వారా అధికారిక డాకెట్ నంబర్ అందుతుంది. తదుపరి పరిశీలనకు ఇది చాలా ముఖ్యం.\n\n` +
        `2. **క్షేత్రస్థాయి సాంకేతిక తనిఖీ**:\n` +
        `   - డిస్కౌం లైన్‌మన్, సబ్-ఇంజనీర్, లేదా అసిస్టెంట్ ఇంజనీర్ (AE / Operations) మీ ప్రాంగణాన్ని సందర్శిస్తారు.\n` +
        `   - మీటర్ సీల్ సమగ్రత, కనెక్షన్ టెర్మినల్ మరియు మీటర్ పల్స్ (క్రీప్ టెస్ట్) పరిశీలిస్తారు.\n\n` +
        `3. **మీటర్ ఖచ్చితత్వ పరీక్ష (Meter Accuracy Test)**:\n` +
        `   - మీటర్ వేగంగా తిరుగుతోందని అనుమానం ఉంటే, అక్కడే పోర్టబుల్ టెస్ట్ కిట్ ద్వారా తనిఖీ చేస్తారు లేదా సీల్ చేసిన మీటర్‌ను డిస్కౌం ల్యాబ్‌కు (MRT Lab) పంపుతారు.\n\n` +
        `4. **బిల్లు సవరణ (Bill Rectification)**:\n` +
        `   - మీటర్ రీడర్ తప్పు రీడింగ్ నమోదు చేసినట్లు నిర్ధారణ అయితే, ERO (Electricity Revenue Office) ద్వారా సరిచేసిన సవరించిన బిల్లు జారీ చేయబడుతుంది.\n` +
        `   - మీటర్ లోపభూయిష్టంగా ఉంటే, గత సాధారణ నెలల సగటు ఆధారంగా బిల్లును సర్దుబాటు చేస్తారు.\n\n` +
        `5. **సమస్య పరిష్కారం కాకపోతే (CGRF అప్పీల్)**:\n` +
        `   - నిర్ణీత గడువులో సమస్య పరిష్కారం కాకపోతే, తెలంగాణ విద్యుత్ నియంత్రణ మండలి (TGERC) ఆధ్వర్యంలోని విద్యుత్ వినియోగదారుల సమస్యల పరిష్కార వేదిక (CGRF) మరియు విద్యుత్ అంబుడ్స్‌మన్‌కు అప్పీల్ చేసుకోవచ్చు.`,
      suggestions: [
        'ఫిర్యాదు లేఖ రాయడానికి సహాయం చేయండి',
        'ఫిర్యాదు కోసం ఏ పత్రాలు కావాలి?',
        'తెలంగాణ విద్యుత్ హెల్ప్‌లైన్ నంబర్ ఎంత?',
      ],
    }
  }

  if (language === 'hi') {
    return {
      reply:
        `### शिकायत दर्ज करने के बाद क्या प्रक्रिया होती है?\n\n` +
        `तेलंगाना विद्युत नियामक आयोग (TGERC) के नियमों के अनुसार शिकायत दर्ज होने के बाद की आधिकारिक प्रक्रिया:\n\n` +
        `1. **डॉकेट / शिकायत संख्या प्राप्ति**:\n` +
        `   - शिकायत दर्ज होते ही एसएमएस द्वारा आधिकारिक डॉकेट संख्या जारी होती है, जिससे आप स्थिति ट्रैक कर सकते हैं।\n\n` +
        `2. **तकनीकी टीम द्वारा भौतिक निरीक्षण**:\n` +
        `   - संबंधित सेक्शन के सहायक अभियंता (AE) या लाइन स्टाफ आपके परिसर का दौरा कर मीटर सील, सर्विस तार और वास्तविक लोड की जांच करते हैं।\n\n` +
        `3. **मीटर शुद्धता परीक्षण (Accuracy Testing)**:\n` +
        `   - यदि मीटर तेज चलने का संदेह हो, तो ऑन-साइट टेस्टिंग किट से जांच की जाती है अथवा मीटर को विभागीय एमआरटी (MRT) लैब भेजा जाता है।\n\n` +
        `4. **बिल संशोधन एवं समायोजन**:\n` +
        `   - यदि रीडर द्वारा टाइपिंग त्रुटि पाई जाती है, तो ईआरओ (ERO) द्वारा संशोधित बिल जारी किया जाता है। मीटर खराब होने पर पिछले महीनों के औसत के आधार पर बिल समायोजित होता है।\n\n` +
        `5. **अपील का अधिकार (CGRF)**:\n` +
        `   - यदि स्थानीय स्तर पर संतोषजनक समाधान न मिले, तो उपभोक्ता TGERC के अंतर्गत उपभोक्ता शिकायत निवारण फोरम (CGRF) और विद्युत ओम्बड्समैन में अपील कर सकते हैं।`,
      suggestions: [
        'शिकायत पत्र का प्रारूप तैयार करें',
        'शिकायत के लिए कौन से दस्तावेज चाहिए?',
        'किस बिजली विभाग से संपर्क करें?',
      ],
    }
  }

  return {
    reply:
      `### What Happens After You Submit an Electricity Complaint?\n\n` +
      `Under the Telangana Electricity Regulatory Commission (TGERC) standards and Citizens' Charter, complaints follow a formal statutory workflow:\n\n` +
      `1. **Docket Generation & SMS Tracking**:\n` +
      `   - An official Docket / Complaint Number is generated instantly and sent to your registered mobile number via SMS.\n\n` +
      `2. **Site Inspection by Technical Officers**:\n` +
      `   - A departmental Lineman, Sub-Engineer, or Assistant Engineer (AE / Operations) is deputed to inspect your physical premises.\n` +
      `   - They verify physical meter serial matching, seal integrity, and observe the optical LED pulse (running a switch-off test).\n\n` +
      `3. **On-Site or Laboratory Meter Testing**:\n` +
      `   - If the meter dial is disputed, an on-site electronic testing kit is connected, or the meter is packaged in a sealed bag in your presence for testing at the DISCOM MRT (Meter Relay & Testing) division.\n\n` +
      `4. **Bill Rectification & Ledger Adjustment**:\n` +
      `   - If an entry error is confirmed (meter reading on bill exceeds current physical dial), the Electricity Revenue Office (ERO) re-issues a revised spot bill under standard adjustment formulas.\n` +
      `   - If the meter was stuck or defective, charges are reassessed based on the average consumption of the preceding 3–6 normal billing months.\n\n` +
      `5. **Consumer Escalation (CGRF & Ombudsman)**:\n` +
      `   - If your grievance is not resolved within the charter timeline, consumers have the legal right to escalate to the **Consumer Grievance Redressal Forum (CGRF)** and the **Vidyut Ombudsman** under TGERC.`,
    suggestions: [
      'Can you help me write a clear complaint?',
      'What information and documents should I prepare?',
      'Which official electricity department should I contact?',
    ],
  }
}

/**
 * 4. Structured Draft Complaint Generator.
 */
export function buildDraftComplaint({ billContext = null, location = null, language = 'en' } = {}) {
  const discom = identifyDiscomByLocation(location)
  const discomCode = discom ? discom.shortName : 'TGSPDCL / TGNPDCL'
  const usc = billContext && billContext.consumer_number ? billContext.consumer_number : '[Your Unique Service Number / USC]'
  const currUnits = billContext && billContext.curr_units != null ? billContext.curr_units : '[Billed Units, e.g. 350]'
  const prevUnits = billContext && billContext.prev_units != null ? billContext.prev_units : '[Previous Units, e.g. 150]'

  if (language === 'te') {
    return {
      reply:
        `### అధికారిక ఫిర్యాదు లేఖ నమూనా (డ్రాఫ్ట్)\n\n` +
        `క్రింది లేఖను కాపీ చేసి మీ వివరాలను పూరించండి. దీనిని ప్రింట్ తీసి మీ స్థానిక సెక్షన్ ఆఫీసులో ఇవ్వవచ్చు లేదా 1912 / ఆన్‌లైన్ పోర్టల్‌లో నమోదు చేయవచ్చు:\n\n` +
        `\`\`\`text\n` +
        `తేదీ: [నేటి తేదీ]\n\n` +
        `స్వీకర్త:\n` +
        `అసిస్టెంట్ ఇంజనీర్ (ఆపరేషన్స్),\n` +
        `సెక్షన్ ఆఫీస్, ${discom ? discom.teluguName : 'TGSPDCL / TGNPDCL'},\n` +
        `[మీ ప్రాంతం / సబ్-స్టేషన్ పేరు, తెలంగాణ]\n\n` +
        `విషయం: స్పాట్ బిల్లు రీడింగ్ తప్పు సవరణ మరియు మీటర్ తనిఖీ కొరకు విన్నపం — సర్వీస్ నంబర్: ${usc}\n\n` +
        `అయ్యా / అమ్మా,\n\n` +
        `నా గృహ విద్యుత్ కనెక్షన్ (USC నంబర్: ${usc}), [వినియోగదారుని పేరు] పేరిట [మీ పూర్తి ఇంటి నంబరు, వీధి, ల్యాండ్‌మార్క్] వద్ద నమోదై ఉంది.\n\n` +
        `[బిల్లు తేదీ] నాటి తాజా స్పాట్ బిల్లు రసీదును పరిశీలించగా, బిల్లులో ముద్రించిన రీడింగ్‌కు మరియు భౌతిక మీటర్ డిస్ప్లే రీడింగ్‌కు తీవ్ర వ్యత్యాసం ఉన్నట్లు గమనించాను:\n` +
        `• బిల్లులో ముద్రించిన ప్రస్తుత రీడింగ్: [బిల్లుపై ఉన్న రీడింగ్] యూనిట్లు (బిల్లు చేసిన వినియోగం: ${currUnits} యూనిట్లు)\n` +
        `• వాస్తవ భౌతిక మీటర్ రీడింగ్ (LCD స్క్రీన్ 2): [మీటర్ డిస్ప్లే రీడింగ్] kWh ([తనిఖీ చేసిన తేదీ] నాటికి)\n` +
        `• సాధారణ నెలవారీ సగటు వినియోగం: సుమారు ${prevUnits} యూనిట్లు\n\n` +
        `ఇంట్లోని ప్రధాన స్విచ్ (MCB) ఆపివేసినప్పుడు మీటర్ పల్స్ ఆగిపోతోంది, కాబట్టి ఇంట్లో ఎలాంటి అదనపు విద్యుత్ వాడకం జరగలేదు. మీటర్ రీడర్ ఎంట్రీ లోపం వల్ల లేదా సాంకేతిక లోపం వల్ల బిల్లు తప్పుగా వచ్చిందని భావిస్తున్నాను.\n\n` +
        `కావున, దయచేసి సంబంధిత సాంకేతిక సిబ్బందిని పంపి భౌతిక మీటర్ రీడింగ్‌ను ధృవీకరించి, సరైన సవరించిన బిల్లును జారీ చేయాల్సిందిగా కోరుతున్నాను. మీటర్ మరియు తాజా బిల్లు రసీదు ఫోటోలను జతపరుస్తున్నాను.\n\n` +
        `ధన్యవాదములు,\n` +
        `భవదీయుడు / భవదీయురాలు,\n` +
        `[మీ పేరు]\n` +
        `మొబైల్ నంబర్: [మీ ఫోన్ నంబర్]\n` +
        `సర్వీస్ నంబర్ (USC): ${usc}\n` +
        `మీటర్ సీరియల్ నంబర్: [మీటర్ నంబర్]\n` +
        `\`\`\`\n\n` +
        `⚠️ **ముఖ్యమైన గమనిక — ఇది కేవలం నమూనా లేఖ (డ్రాఫ్ట్ మాత్రమే)**:\n` +
        `• TheftGuard AI అనేది ఒక స్వతంత్ర విశ్లేషణ వ్యవస్థ; ఇది విద్యుత్ సంస్థలకు నేరుగా ఫిర్యాదులను పంపదు.\n` +
        `• ఈ లేఖను కాపీ చేసి మీ వివరాలను నింపి, **1912** హెల్ప్‌లైన్ ద్వారా లేదా మీ స్థానిక విద్యుత్ సెక్షన్ ఆఫీసులో సమర్పించండి.`,
      suggestions: [
        'ఫిర్యాదు కోసం ఏ పత్రాలు కావాలి?',
        'ఫిర్యాదు చేసిన తర్వాత ఏమి జరుగుతుంది?',
        'తెలంగాణ విద్యుత్ హెల్ప్‌లైన్ నంబర్ ఎంత?',
      ],
    }
  }

  if (language === 'hi') {
    return {
      reply:
        `### आधिकारिक शिकायत पत्र का प्रारूप (Draft Template)\n\n` +
        `कृपया इस प्रारूप को कॉपी करके अपनी जानकारी भरें। इसे आप अपने स्थानीय सेक्शन कार्यालय में जमा कर सकते हैं अथवा 1912 या ऑनलाइन पोर्टल पर उपयोग कर सकते हैं:\n\n` +
        `\`\`\`text\n` +
        `दिनांक: [आज की तारीख]\n\n` +
        `सेवा में,\n` +
        `सहायक अभियंता (संचालन),\n` +
        `सेक्शन कार्यालय, ${discom ? discom.hindiName : 'TGSPDCL / TGNPDCL'},\n` +
        `[क्षेत्र / सब-स्टेशन का नाम, तेलंगाना]\n\n` +
        `विषय: स्पॉट बिल रीडिंग संशोधन एवं मीटर सत्यापन हेतु आवेदन — सर्विस संख्या: ${usc}\n\n` +
        `महोदय / महोदया,\n\n` +
        `मेरा घरेलू बिजली कनेक्शन (USC संख्या: ${usc}), [उपभोक्ता का नाम] के नाम पर [पूरा पता एवं लैंडमार्क] पर स्थापित है।\n\n` +
        `दिनांक [बिल की तारीख] के नवीनतम स्पॉट बिल का निरीक्षण करने पर मैंने पाया कि बिल में दर्ज रीडिंग और भौतिक मीटर की वास्तविक रीडिंग में भारी अंतर है:\n` +
        `• बिल में दर्ज वर्तमान रीडिंग: [बिल पर मुद्रित रीडिंग] यूनिट (बिल की गई खपत: ${currUnits} यूनिट)\n` +
        `• भौतिक मीटर डिस्प्ले पर वास्तविक रीडिंग (LCD स्क्रीन 2): [मीटर रीडिंग] kWh (दिनांक [निरीक्षण तारीख] तक)\n` +
        `• सामान्य औसत मासिक खपत: लगभग ${prevUnits} यूनिट\n\n` +
        `घर के मुख्य स्विच (MCB) को बंद करने पर मीटर पल्स रुक जाती है, जिससे स्पष्ट है कि घरेलू वायरिंग में कोई रिसाव नहीं है और न ही कोई नया उपकरण जोड़ा गया है। प्रतीत होता है कि मीटर रीडर द्वारा टाइपिंग त्रुटि हुई है।\n\n` +
        `अतः आपसे विनम्र अनुरोध है कि कृपया तकनीकी कर्मी को भेजकर मीटर रीडिंग का सत्यापन कराएं तथा नियमानुसार संशोधित बिल जारी करने की कृपा करें। मीटर रीडिंग का फोटो व बिल प्रति संलग्न है।\n\n` +
        `सधन्यवाद,\n` +
        `भवदीय / भवदीया,\n` +
        `[आपका नाम]\n` +
        `मोबाइल नंबर: [आपका फोन नंबर]\n` +
        `USC संख्या: ${usc}\n` +
        `मीटर सीरियल नंबर: [मीटर नंबर]\n` +
        `\`\`\`\n\n` +
        `⚠️ **महत्वपूर्ण सूचना — केवल प्रारूप (Draft Only, Not Submitted)**:\n` +
        `• TheftGuard AI सीधे डिस्कॉम सिस्टम में शिकायत दर्ज नहीं करता है।\n` +
        `• कृपया इस प्रारूप को कॉपी कर अपनी जानकारी भरें और **1912** हेल्पलाइन, डिस्कॉम मोबाइल ऐप अथवा नजदीकी कार्यालय में स्वयं जमा करें।`,
      suggestions: [
        'शिकायत के लिए कौन से दस्तावेज चाहिए?',
        'शिकायत के बाद क्या प्रक्रिया होती है?',
        'किस बिजली विभाग से संपर्क करें?',
      ],
    }
  }

  // English default
  return {
    reply:
      `### Structured Complaint Draft Template\n\n` +
      `You can copy and adapt this professional, non-accusatory draft for submission to your distribution utility:\n\n` +
      `\`\`\`text\n` +
      `Date: [Current Date]\n\n` +
      `To\n` +
      `The Assistant Engineer (Operations),\n` +
      `Section Office, ${discom ? discom.name : discomCode},\n` +
      `[Area / Sub-station Name, Telangana]\n\n` +
      `Subject: Request for Spot Bill Reading Verification & Inspection — Service No (USC): ${usc}\n\n` +
      `Respected Sir / Madam,\n\n` +
      `I am writing in regard to our domestic electricity connection under Unique Service Number (USC): ${usc}, registered in the name of [Consumer Name], located at [Full Address / Nearby Landmark].\n\n` +
      `Upon reviewing our latest spot bill dated [Bill Date], I observed a notable discrepancy between the reading entered on the bill receipt and the physical meter display:\n` +
      `• Billed "Present Reading": [Reading printed on bill] units (Billed Units: ${currUnits} kWh)\n` +
      `• Physical Meter Reading (Screen 2 LCD): [Reading shown on meter dial] kWh (as of [Inspection Date])\n` +
      `• Baseline Average Consumption: Approximately ${prevUnits} kWh/month\n\n` +
      `We carried out a main switch-off test and confirmed that the meter LED stops blinking when the MCB is off. No high-power appliances or additional loads were operated during this cycle. The discrepancy appears to be an over-billing punch entry error or an unverified estimation.\n\n` +
      `I kindly request your office to:\n` +
      `1. Depute an inspecting officer to verify the physical meter reading and seal integrity.\n` +
      `2. Issue a rectified bill based on actual physical consumption under the Telangana Electricity Supply Code.\n\n` +
      `I have attached a dated photograph of the meter display and a copy of the recent spot bill receipt for your reference.\n\n` +
      `Thank you.\n\n` +
      `Yours sincerely,\n` +
      `[Your Name]\n` +
      `Contact Mobile: [Your Phone Number]\n` +
      `USC Number: ${usc}\n` +
      `Meter Serial Number: [Meter Serial Number]\n` +
      `\`\`\`\n\n` +
      `⚠️ **Crucial Disclaimer — Draft Only (Not Automatically Submitted)**:\n` +
      `• **No Automated Submission**: TheftGuard AI does not connect to DISCOM dispatch systems and cannot submit complaints on your behalf.\n` +
      `• **Next Step**: Copy this text, fill in your brackets, and submit via:\n` +
      `  1. Centralized 24x7 Helpline: **1912**\n` +
      `  2. Official Web Portal (**tgspdcl.cgg.gov.in** or **tgnpdcl.com**) or Mobile App\n` +
      `  3. Hand-delivery to your local Section Office Assistant Engineer (AE / Operations).`,
    suggestions: [
      'What information and documents should I prepare?',
      'What happens after I submit a complaint?',
      'Which official electricity department should I contact?',
    ],
  }
}
