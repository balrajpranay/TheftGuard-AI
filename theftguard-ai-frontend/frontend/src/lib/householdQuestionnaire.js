/**
 * Household Usage Questionnaire & Energy Estimation Engine
 * 
 * Provides:
 * - Progressive questionnaire schema with user-friendly options and Skip capability
 * - Standard Indian BEE wattage and appliance consumption models (3-star ratings)
 * - Safe, non-accusatory estimation of household monthly load
 * - Synthesis of bill variance with questionnaire findings
 */

export const APPLIANCE_SPECS = {
  ac_1_5_ton: {
    name: '1.5 Ton AC (3-Star Inverter)',
    ratedWatts: 1200,
    kwhPerHour: 0.95, // ~1200W with typical 80% compressor duty cycle in Indian summer
    icon: '❄️',
    description: 'Typical bedroom split inverter air conditioner.',
  },
  geyser_2kw: {
    name: 'Water Heater / Geyser (2kW, 15–25L)',
    ratedWatts: 2000,
    kwhPerHour: 2.0,
    icon: '♨️',
    description: 'Storage geyser running resistance element heating.',
  },
  refrigerator_250l: {
    name: 'Refrigerator (250L Frost-Free 3-Star)',
    ratedWatts: 150,
    kwhPerDay: 1.0, // ~30–35 kWh/month
    icon: '🧊',
    description: 'Modern double-door frost-free household refrigerator.',
  },
  water_pump_1hp: {
    name: 'Water Pump / Borewell (1 HP)',
    ratedWatts: 750,
    kwhPerHour: 0.75,
    icon: '💧',
    description: 'Standard domestic water booster or borewell pump.',
  },
  washing_machine: {
    name: 'Washing Machine (Fully Automatic)',
    ratedWatts: 500,
    kwhPerCycle: 0.5,
    icon: '🧺',
    description: 'Top or front loading domestic washer (without heating element).',
  },
}

export const INITIAL_QUESTIONNAIRE_ANSWERS = {
  occupants: '',
  has_ac: '',
  ac_count: 1,
  ac_hours: 6,
  ac_increased: '',
  has_geyser: '',
  geyser_minutes: 30,
  has_refrigerator: '',
  has_pump: '',
  pump_hours: 1,
  has_washing_machine: '',
  lifestyle_change: '',
  meter_confidence: '',
}

export const QUESTIONNAIRE_STEPS = [
  {
    id: 'occupants',
    category: 'household',
    title: 'Household Size',
    prompt: 'How many people regularly live in your household?',
    helper: 'Helps estimate baseline lighting, fans, entertainment, and everyday cooking load.',
    icon: '👥',
    options: [
      { value: '1-2', label: '1 – 2 persons', subtext: 'Small household or studio' },
      { value: '3-4', label: '3 – 4 persons', subtext: 'Typical family home' },
      { value: '5+', label: '5 or more persons', subtext: 'Joint or large family' },
      { value: 'skip', label: 'Skip / Prefer not to say', subtext: 'Use standard baseline' },
    ],
  },
  {
    id: 'has_ac',
    category: 'cooling',
    title: 'Air Conditioning',
    prompt: 'Do you use air conditioning (AC) at home?',
    helper: 'Air conditioners are often the single largest driver of summer electricity changes.',
    icon: '❄️',
    options: [
      { value: 'yes', label: 'Yes, we use AC', subtext: 'Split or window units' },
      { value: 'no', label: 'No AC installed or used', subtext: 'Ceiling fans / coolers only' },
      { value: 'skip', label: 'Skip this question', subtext: 'Leave AC out of estimation' },
    ],
  },
  {
    id: 'ac_details',
    category: 'cooling',
    title: 'AC Usage Details',
    prompt: 'How many AC units do you run, and for about how many hours per day?',
    helper: 'A standard 1.5-ton 3-star AC uses ~0.95 kWh per hour of compressor operation.',
    icon: '⏱️',
    condition: (answers) => answers.has_ac === 'yes',
    fields: [
      {
        name: 'ac_count',
        label: 'Number of ACs',
        type: 'select',
        options: [
          { value: 1, label: '1 AC unit' },
          { value: 2, label: '2 AC units' },
          { value: 3, label: '3 AC units' },
          { value: 4, label: '4+ AC units' },
        ],
      },
      {
        name: 'ac_hours',
        label: 'Average Hours/Day per AC',
        type: 'select',
        options: [
          { value: 3, label: '3 hours / night' },
          { value: 6, label: '6 hours / day' },
          { value: 8, label: '8 hours / night' },
          { value: 12, label: '12+ hours (day & night)' },
        ],
      },
      {
        name: 'ac_increased',
        label: 'Did AC use increase recently?',
        type: 'select',
        options: [
          { value: 'summer', label: 'Yes, hotter summer weather' },
          { value: 'guests', label: 'Yes, guests stayed over' },
          { value: 'no', label: 'No, stayed about the same' },
          { value: 'skip', label: 'Not sure' },
        ],
      },
    ],
  },
  {
    id: 'has_geyser',
    category: 'water_heating',
    title: 'Water Heater / Geyser',
    prompt: 'Do you use an electric water heater or geyser?',
    helper: 'A 2000W geyser uses about 1 unit (1 kWh) of electricity for every 30 minutes of heating.',
    icon: '♨️',
    options: [
      { value: 'yes', label: 'Yes, regularly', subtext: 'Used for daily showers or kitchen' },
      { value: 'no', label: 'No electric geyser', subtext: 'Solar or instant gas / not used' },
      { value: 'skip', label: 'Skip this question', subtext: 'Do not estimate geyser' },
    ],
  },
  {
    id: 'has_refrigerator',
    category: 'kitchen',
    title: 'Refrigerator',
    prompt: 'What kind of refrigerator does your household use?',
    helper: 'Fridges run 24/7 and consume roughly 25 to 40 units per month depending on capacity.',
    icon: '🧊',
    options: [
      { value: 'single_door', label: 'Single Door (Direct Cool)', subtext: '~20–25 kWh / month' },
      { value: 'double_door', label: 'Double Door (Frost Free, 250L)', subtext: '~30–35 kWh / month' },
      { value: 'side_by_side', label: 'Large / Multi-Door (400L+)', subtext: '~45–60 kWh / month' },
      { value: 'none', label: 'No refrigerator', subtext: 'Zero refrigeration load' },
      { value: 'skip', label: 'Skip / Not sure', subtext: 'Standard 250L default' },
    ],
  },
  {
    id: 'has_pump',
    category: 'water_supply',
    title: 'Water Pump / Borewell',
    prompt: 'Does your home run a water pump or borewell motor?',
    helper: 'A 1 HP motor uses roughly 0.75 kWh per hour of pumping.',
    icon: '💧',
    options: [
      { value: 'one_hp', label: 'Yes, 1 HP pump / motor', subtext: 'Typically 45–60 mins daily' },
      { value: 'half_hp', label: 'Yes, 0.5 HP small booster', subtext: 'Light rooftop transfer' },
      { value: 'none', label: 'No domestic pump', subtext: 'Direct gravity or piped line' },
      { value: 'skip', label: 'Skip / Not sure', subtext: 'Exclude from calculation' },
    ],
  },
  {
    id: 'lifestyle_change',
    category: 'lifestyle',
    title: 'Recent Household Events',
    prompt: 'Did anything unusual happen in your home during this billing cycle?',
    helper: 'Temporary events explain many sudden shifts in billing without indicating any equipment fault.',
    icon: '🏡',
    options: [
      { value: 'none', label: 'No notable changes', subtext: 'Routine everyday life' },
      { value: 'guests', label: 'Visiting relatives / guests', subtext: 'More hot water, cooking, fans/AC' },
      { value: 'summer_heatwave', label: 'Severe heatwave / humidity', subtext: 'Cooling appliances ran harder' },
      { value: 'wfh', label: 'Family working from home', subtext: 'Daytime computers, lights, and AC' },
      { value: 'vacant', label: 'House was locked / traveled', subtext: 'Expected lower consumption' },
      { value: 'new_appliance', label: 'Purchased a new appliance', subtext: 'Added new load to the home' },
      { value: 'skip', label: 'Skip / Not sure', subtext: 'No special context' },
    ],
  },
  {
    id: 'meter_confidence',
    category: 'meter',
    title: 'Meter Condition & Reading',
    prompt: 'How does your physical electricity meter look?',
    helper: 'Helps us guide you on whether to contact your electricity board for a meter test.',
    icon: '📟',
    options: [
      { value: 'normal', label: 'Looks normal and display is clear', subtext: 'Dial increments steadily' },
      { value: 'reads_higher', label: 'Bill reading looks higher than meter dial', subtext: 'Possible punch error' },
      { value: 'faulty_display', label: 'Screen is blank, flashing, or jumping', subtext: 'Needs DISCOM testing' },
      { value: 'skip', label: 'Have not checked the meter', subtext: 'We will show how to verify' },
    ],
  },
]

/**
 * Calculates itemized appliance estimates based on standard Indian ratings
 * over the specified billing period (default 30 days).
 */
export function calculateApplianceEstimates(answers = {}, billingDays = 30) {
  const days = Math.max(1, Math.min(120, Number(billingDays) || 30))
  const estimates = []

  // AC Estimation
  if (answers.has_ac === 'yes') {
    const count = Math.max(1, Math.min(10, Number(answers.ac_count) || 1))
    const hours = Math.max(0.5, Math.min(24, Number(answers.ac_hours) || 6))
    const spec = APPLIANCE_SPECS.ac_1_5_ton
    const monthlyKwh = Math.round(count * hours * spec.kwhPerHour * days * 10) / 10

    estimates.push({
      appliance: count > 1 ? `${count}x ${spec.name}` : spec.name,
      wattageWatts: spec.ratedWatts * count,
      dailyHours: hours,
      estimatedMonthlyKwh: monthlyKwh,
      assumptions: `${count} unit(s) running ~${hours} hrs/day at ${spec.kwhPerHour} kWh/hr (BEE 3-Star inverter cycling).`,
      icon: spec.icon,
    })
  }

  // Geyser Estimation
  if (answers.has_geyser === 'yes') {
    const minutes = Math.max(10, Math.min(240, Number(answers.geyser_minutes) || 30))
    const hours = minutes / 60
    const spec = APPLIANCE_SPECS.geyser_2kw
    const monthlyKwh = Math.round(hours * spec.kwhPerHour * days * 10) / 10

    estimates.push({
      appliance: spec.name,
      wattageWatts: spec.ratedWatts,
      dailyHours: Math.round(hours * 10) / 10,
      estimatedMonthlyKwh: monthlyKwh,
      assumptions: `~${minutes} mins/day heating duration over ${days} billing days.`,
      icon: spec.icon,
    })
  }

  // Refrigerator Estimation
  if (answers.has_refrigerator && answers.has_refrigerator !== 'none' && answers.has_refrigerator !== 'skip') {
    let kwhPerDay = 1.0
    let label = 'Refrigerator (250L Frost Free)'
    if (answers.has_refrigerator === 'single_door') {
      kwhPerDay = 0.75
      label = 'Refrigerator (190L Direct Cool)'
    } else if (answers.has_refrigerator === 'side_by_side') {
      kwhPerDay = 1.8
      label = 'Large Multi-Door Refrigerator (400L+)'
    }
    const monthlyKwh = Math.round(kwhPerDay * days * 10) / 10

    estimates.push({
      appliance: label,
      wattageWatts: 150,
      dailyHours: 24,
      estimatedMonthlyKwh: monthlyKwh,
      assumptions: `Continuous operation with compressor auto-cycling (~${kwhPerDay} kWh/day).`,
      icon: '🧊',
    })
  } else if (!answers.has_refrigerator) {
    // Default standard fridge if left blank
    const spec = APPLIANCE_SPECS.refrigerator_250l
    const monthlyKwh = Math.round(spec.kwhPerDay * days * 10) / 10
    estimates.push({
      appliance: spec.name,
      wattageWatts: spec.ratedWatts,
      dailyHours: 24,
      estimatedMonthlyKwh: monthlyKwh,
      assumptions: `Default continuous operation assumption (~${spec.kwhPerDay} kWh/day).`,
      icon: spec.icon,
    })
  }

  // Water Pump Estimation
  if (answers.has_pump && answers.has_pump !== 'none' && answers.has_pump !== 'skip') {
    const isHalfHp = answers.has_pump === 'half_hp'
    const rated = isHalfHp ? 375 : 750
    const kwhPerHour = isHalfHp ? 0.38 : 0.75
    const hours = Math.max(0.25, Math.min(8, Number(answers.pump_hours) || 1))
    const monthlyKwh = Math.round(hours * kwhPerHour * days * 10) / 10

    estimates.push({
      appliance: isHalfHp ? 'Water Pump (0.5 HP)' : 'Water Pump / Borewell (1 HP)',
      wattageWatts: rated,
      dailyHours: hours,
      estimatedMonthlyKwh: monthlyKwh,
      assumptions: `~${hours} hr(s) daily pumping over ${days} billing days.`,
      icon: '💧',
    })
  }

  // Washing Machine
  if (answers.has_washing_machine === 'yes') {
    const spec = APPLIANCE_SPECS.washing_machine
    // assume ~15 cycles a month for typical family
    const cycles = Math.round((days / 30) * 16)
    const monthlyKwh = Math.round(cycles * spec.kwhPerCycle * 10) / 10

    estimates.push({
      appliance: spec.name,
      wattageWatts: spec.ratedWatts,
      dailyHours: 0.5,
      estimatedMonthlyKwh: monthlyKwh,
      assumptions: `~${cycles} wash cycles per cycle (~0.5 kWh/wash).`,
      icon: spec.icon,
    })
  }

  const totalEstimatedKwh = Math.round(estimates.reduce((acc, e) => acc + e.estimatedMonthlyKwh, 0) * 10) / 10

  return {
    estimates,
    totalEstimatedKwh,
    billingDays: days,
  }
}

/**
 * Synthesizes validated bill differences and questionnaire responses into a friendly,
 * transparent, and strictly non-accusatory structured explanation.
 */
export function synthesizeAnalysis(billSummary, answers = {}) {
  if (!billSummary || billSummary.previousUnits == null || billSummary.currentUnits == null) {
    return {
      outcome: 'insufficient_information',
      headline: 'Awaiting Bill Comparison Details',
      plausibleCauses: [
        'Please upload or enter details for both your previous and current electricity bills to evaluate changes.',
      ],
      disclaimers: [
        'All calculations are educational estimates based on standard Indian BEE appliance ratings.',
        'Neutral Finding: Normal household fluctuations, weather, visitors, or tariff slab crossing does not establish electricity theft or meter tampering.',
      ],
      recommendedSteps: [
        'Fill in the Previous and Current bill details in the Bill Comparison tool.',
        'Answer the brief household questions to personalize your energy breakdown.',
      ],
      estimates: [],
      totalEstimatedKwh: 0,
      explainedDifferencePct: null,
    }
  }

  const cycleDays = billSummary.billingDays || 30
  const { estimates, totalEstimatedKwh } = calculateApplianceEstimates(answers, cycleDays)
  const deltaKwh = Math.round((billSummary.currentUnits - billSummary.previousUnits) * 10) / 10
  const deltaAmount = billSummary.amountDifference || 0

  const plausibleCauses = []
  const disclaimers = [
    'Estimates use standard Indian 3-star appliance ratings and typical duty cycles; actual consumption depends on appliance age, thermostat settings, and wiring efficiency.',
    'Neutral Finding: Normal household fluctuations, weather, visitors, or tariff slab crossing does not establish electricity theft or meter tampering.',
  ]

  const recommendedSteps = [
    'Compare your physical meter dial with the "Current Reading" printed on your electricity bill.',
    'Review your state DISCOM tariff slab: crossing a slab threshold (e.g. 100 or 200 units) increases the per-unit rate for all units in that bracket.',
    'If you notice unmetered load or suspect a mechanical meter defect, contact your DISCOM helpline (e.g. 1912 in Telangana) for a meter test.',
  ]

  let outcome = 'insufficient_information'
  let headline = 'Bill & Questionnaire Synthesis'
  let explainedDifferencePct = null

  // Case 1: Minimal or no consumption difference
  if (Math.abs(deltaKwh) <= 15) {
    outcome = 'no_unusual_change'
    headline = 'Consumption is Stable and Consistent'
    plausibleCauses.push(
      `Your consumption changed by only ${deltaKwh > 0 ? '+' : ''}${deltaKwh} kWh, which is within routine monthly variance (±5%).`
    )
    if (Math.abs(deltaAmount) > 100) {
      plausibleCauses.push(
        `Notice: Your bill amount changed by ₹${Math.abs(deltaAmount).toLocaleString('en-IN')}, despite steady units. This usually stems from fixed charges, electricity duty, seasonal fuel surcharges, or arrears rather than extra energy usage.`
      )
    }
  } else if (deltaKwh > 15) {
    // Consumption increased
    const acReported = answers.has_ac === 'yes'
    const acIncreased = ['yes', 'summer', 'guests'].includes(answers.ac_increased)
    const guestsReported = answers.lifestyle_change === 'guests'
    const heatwaveReported = answers.lifestyle_change === 'summer_heatwave'
    const wfhReported = answers.lifestyle_change === 'wfh'
    const newAppliance = answers.lifestyle_change === 'new_appliance'

    if (acReported && (acIncreased || heatwaveReported)) {
      outcome = 'change_explained_by_appliances'
      headline = `Consumption Increase (+${deltaKwh} kWh) Closely Matches Cooling Load`
      plausibleCauses.push(
        `Your reported air conditioning setup accounts for approximately ${totalEstimatedKwh} kWh of estimated monthly consumption.`
      )
      plausibleCauses.push(
        'During hotter months, AC compressors work longer duty cycles to reach target thermostat temperatures, noticeably lifting power draw even without extra run hours.'
      )
      explainedDifferencePct = Math.min(100, Math.round((totalEstimatedKwh / Math.max(1, deltaKwh)) * 100))
    } else if (guestsReported) {
      outcome = 'change_explained_by_appliances'
      headline = `Increase (+${deltaKwh} kWh) Consistent with Additional Guests`
      plausibleCauses.push(
        'Having guests or visiting family increases water heating, fan/AC run-time, food refrigeration, and laundry cycles.'
      )
      plausibleCauses.push(
        `Estimated active appliances in your home account for ~${totalEstimatedKwh} kWh of total monthly demand.`
      )
    } else if (wfhReported || newAppliance) {
      outcome = 'change_explained_by_appliances'
      headline = `Increase (+${deltaKwh} kWh) Aligns with Added Equipment / Daytime Use`
      plausibleCauses.push(
        'Daytime home occupancy and new electronic appliances increase continuous active power draw throughout peak daytime hours.'
      )
    } else if (answers.meter_confidence === 'reads_higher') {
      outcome = 'discrepancy_needs_verification'
      headline = 'Possible Billing Reading Discrepancy'
      plausibleCauses.push(
        'You indicated that the bill reading seems higher than the number visible on your physical meter dial.'
      )
      plausibleCauses.push(
        'Meter reader punch errors or estimated bills happen occasionally when access to the meter box is blocked.'
      )
      recommendedSteps.unshift(
        'Take a clear, dated photo of your physical meter display and submit a reading revision request to your electricity office.'
      )
    } else {
      outcome = 'unexplained_increase'
      headline = `Unexplained Rise of +${deltaKwh} kWh Requires Review`
      plausibleCauses.push(
        `Reported appliances account for about ${totalEstimatedKwh} kWh, leaving part of the +${deltaKwh} kWh increase unexplained by the questions answered.`
      )
      plausibleCauses.push(
        'Common unnoticed culprits include: continuous water leaks causing pumps to cycle repeatedly, aging refrigerator door seals, or unmetered sub-line connections.'
      )
      recommendedSteps.unshift(
        'Perform a simple "switch-off test": turn off all appliances and observe if the red LED or digital meter dial continues pulsing.'
      )
    }
  } else {
    // Consumption decreased (deltaKwh < -15)
    outcome = 'consumption_decreased'
    headline = `Consumption Decreased by ${Math.abs(deltaKwh)} kWh`
    if (answers.lifestyle_change === 'vacant') {
      plausibleCauses.push('The reduction aligns with the house being vacant or family traveling during this cycle.')
    } else {
      plausibleCauses.push(
        `Your energy usage dropped from ${billSummary.previousUnits} kWh to ${billSummary.currentUnits} kWh, a welcome reduction of ${Math.abs(deltaKwh)} units.`
      )
      plausibleCauses.push('Seasonal cooldown, energy-efficient habits, or reduced heavy appliance usage usually explain this.')
    }
  }

  // Check meter confidence flags
  if (answers.meter_confidence === 'faulty_display') {
    plausibleCauses.push('Notice: You reported an unreadable or erratic meter display. Contact your DISCOM to prevent averaged/provisional billing.')
  }

  return {
    outcome,
    headline,
    plausibleCauses,
    disclaimers,
    recommendedSteps,
    estimates,
    totalEstimatedKwh,
    deltaKwh,
    explainedDifferencePct,
    cycleDays,
  }
}

/**
 * Checks how many questions have been answered.
 */
export function getQuestionnaireProgress(answers = {}) {
  const coreIds = ['occupants', 'has_ac', 'has_geyser', 'has_refrigerator', 'has_pump', 'lifestyle_change', 'meter_confidence']
  let answered = 0
  for (const id of coreIds) {
    if (answers[id] && answers[id] !== '') {
      answered++
    }
  }
  return {
    answered,
    total: coreIds.length,
    percent: Math.round((answered / coreIds.length) * 100),
  }
}
