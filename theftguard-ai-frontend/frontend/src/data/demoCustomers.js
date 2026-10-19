// DEMONSTRATION DATA. Every value below is generated in the browser from a fixed seed.
// None of it is real customer data and none of the scores come from the model.
export const WINDOW = 1034

export function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r3 = (x) => Math.round(x * 1000) / 1000

export function buildDemoCustomers(count = 120) {
  const r = seeded(2026)
  const zones = ['Demo zone A', 'Demo zone B', 'Demo zone C']
  const out = []
  for (let i = 1; i <= count; i++) {
    const valid = Math.round(380 + r() * 650)
    const zero = Math.floor(valid * r() * 0.06)
    const pos = valid - zero
    const mean = r3(2.5 + r() * 11)
    const median = r3(mean * (0.78 + r() * 0.3))
    const max = r3(mean * (2.2 + r() * 4))
    const std = r3(mean * (0.25 + r() * 0.5))
    const min = zero > 0 ? 0 : r3(0.2 + r() * 1.2)
    const u = r()
    const s = u < 0.11 ? 0.5 + r() * 0.42 : u < 0.27 ? 0.3 + r() * 0.19 : r() * 0.29
    out.push({
      id: `DEMO-${String(i).padStart(4, '0')}`,
      group: zones[i % 3],
      score: r3(s),
      isDemo: true,
      features: {
        valid_readings: valid,
        missing_percent: r3(((WINDOW - valid) / WINDOW) * 100),
        zero_count: zero,
        zero_percent_of_observed: r3((zero / valid) * 100),
        mean_observed: mean,
        median_observed: median,
        std_observed: std,
        min_observed: min,
        max_observed: max,
        mean_positive: r3((mean * valid) / pos),
        median_positive: r3(median * 1.02),
        positive_readings: pos,
        positive_percent_of_all_dates: r3((pos / WINDOW) * 100),
      },
    })
  }
  return out
}
