import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button, CategoryBadge, DemoBadge, ScoreScale } from '../components/ui'
import { buildDemoCustomers } from '../data/demoCustomers'
import { MODEL_FACTS } from '../data/modelFacts'
import { classify, DEFAULT_THRESHOLDS } from '../lib/risk'
import { score as fmtScore } from '../lib/format'

const STEPS = [
  {
    title: 'Screen records',
    body: 'Upload a CSV with the 13 customer-level features the model was trained on. The model returns a Model Score for each customer. A high score recommends review. It does not show that theft occurred.',
  },
  {
    title: 'Compare consumption',
    body: 'Separately, load a kWh file and choose a split date. The comparison is plain arithmetic on historical and current daily averages, with a ₹ per kWh tariff you set for a clearly labelled estimate. It does not use the model.',
  },
  {
    title: 'Follow up',
    body: 'Add customers to an investigation list, work through an inspection checklist, keep field notes and prepare a report for the people who decide what happens next.',
  },
]

export default function Landing() {
  const top = useMemo(() => [...buildDemoCustomers()].sort((a, b) => b.score - a.score).slice(0, 5), [])
  const m = Object.fromEntries(MODEL_FACTS.metrics.map((x) => [x.key, x.value]))
  const flagged = MODEL_FACTS.confusion.TP + MODEL_FACTS.confusion.FP

  return (
    <>
      <section className="border-b border-line bg-pale">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-medium text-gold-deep">Electricity Theft Detection Using Machine Learning</p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Analyze consumption.<br />
              Detect suspicious patterns.<br />
              Support investigation.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink/80">
              TheftGuard AI helps utility analysts screen customer records with a machine-learning model, compare
              historical and current kWh, and keep track of the inspections that follow.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button to="/app/dashboard" variant="primary" icon="arrowRight">Open demo workspace</Button>
              <Button to="/app/model" variant="secondary">Read the verified model results</Button>
            </div>
          </div>

          <figure className="rounded border border-ink bg-white" aria-label="Example of screening results">
            <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <span className="font-display font-semibold">Screening results</span>
              <DemoBadge>Demonstration data</DemoBadge>
            </figcaption>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-2 font-medium">Customer</th>
                    <th scope="col" className="px-4 py-2 font-medium">Model Score</th>
                    <th scope="col" className="px-4 py-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-3 font-medium">{c.id}</th>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-12">{fmtScore(c.score)}</span>
                          <ScoreScale score={c.score} thresholds={DEFAULT_THRESHOLDS} />
                        </div>
                      </td>
                      <td className="px-4 py-3"><CategoryBadge category={classify(c.score, DEFAULT_THRESHOLDS)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-muted">
              The Model Score is a vote fraction between 0 and 1, not a probability. The black marker shows the score;
              gold marks the review band. These rows are invented for demonstration.
            </p>
          </figure>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-14 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Three jobs, kept separate</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Model screening and consumption comparison answer different questions, so the workspace never blends them into one number.
        </p>
        <dl className="mt-8 border-t border-ink">
          {STEPS.map((s) => (
            <div key={s.title} className="grid gap-2 border-b border-line py-6 md:grid-cols-[240px_1fr] md:gap-8">
              <dt className="font-display text-xl font-semibold">{s.title}</dt>
              <dd className="max-w-2xl text-ink/85">{s.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="model" className="scroll-mt-4 border-y border-line bg-mist">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">What the model can and cannot say</h2>
            <p className="mt-3 text-ink/85">
              On a held-out test of {MODEL_FACTS.testRows.toLocaleString('en-IN')} customers, the model flagged{' '}
              {flagged.toLocaleString('en-IN')} (10.7%). Of those, {MODEL_FACTS.confusion.TP} carried the dataset label
              FLAG = 1, and it missed {MODEL_FACTS.confusion.FN} of the {MODEL_FACTS.testPositives} labelled customers.
            </p>
            <p className="mt-3 text-ink/85">
              The result comes from one random split of a dataset whose source and licence are not yet confirmed. It is
              not external validation, and it has not been tested on Indian consumption data.
            </p>
            <Button to="/app/model" variant="dark" className="mt-5" icon="arrowRight">See all results and limitations</Button>
          </div>
          <div>
            <h3 className="sr-only">Verified test results</h3>
            <table className="w-full border-t border-ink text-left">
              <tbody>
                {[
                  ['Precision (FLAG = 1)', m.precision.toFixed(2)],
                  ['Recall (FLAG = 1)', m.recall.toFixed(2)],
                  ['ROC-AUC', m.roc.toFixed(2)],
                  ['PR-AUC (a random guess scores 0.09)', m.pr.toFixed(2)],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-line">
                    <th scope="row" className="py-3 pr-4 font-normal">{k}</th>
                    <td className="py-3 text-right font-display text-2xl font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Source: the project's recorded test results, reproduced by its verification checks.</p>
          </div>
        </div>
      </section>

      <section id="use" className="on-dark scroll-mt-4 bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Responsible use</h2>
          <ul className="mt-6 grid gap-x-10 gap-y-5 text-white/85 md:grid-cols-3">
            <li className="border-t border-gold pt-3">A Model Score is not a probability. It ranks records for attention.</li>
            <li className="border-t border-gold pt-3">A flag recommends review. It is never proof of electricity theft, and only a qualified investigation can establish it.</li>
            <li className="border-t border-gold pt-3">Financial figures are estimates from a tariff you set in ₹ per kWh, with the assumptions stated beside them.</li>
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button to="/app/dashboard" variant="primary">Open demo workspace</Button>
            <Link to="/signin" className="text-sm underline underline-offset-2 hover:text-gold">Sign in (not connected in this preview)</Link>
          </div>
        </div>
      </section>
    </>
  )
}
