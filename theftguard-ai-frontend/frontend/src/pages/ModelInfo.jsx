import { Badge, PageHeader, Panel } from '../components/ui'
import { MODEL_FACTS } from '../data/modelFacts'
import { CHECK_LABELS, FEATURES } from '../data/features'

export default function ModelInfo() {
  const c = MODEL_FACTS.confusion
  return (
    <>
      <PageHeader title="Model and data">
        What the saved model is, what its documented tests showed, and what has not been confirmed. Every figure on this page
        comes from the project's recorded results.
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="The model">
          <p className="text-sm">{MODEL_FACTS.description}</p>
          <dl className="mt-3 divide-y divide-line text-sm">
            <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Output</dt><dd className="text-right">Model Score (vote fraction for FLAG = 1)</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Default threshold</dt><dd>{MODEL_FACTS.threshold.toFixed(2)}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Stored scikit-learn version</dt><dd>{MODEL_FACTS.storedSklearn}</dd></div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-2"><dt className="shrink-0 text-muted">File fingerprint (SHA-256)</dt><dd className="break-all sm:text-right text-xs font-mono">{MODEL_FACTS.sha256}</dd></div>
          </dl>
        </Panel>

        <Panel data-tour="model-metrics" title="Test results" subtitle={`${MODEL_FACTS.testRows.toLocaleString('en-IN')} held-out customers, ${MODEL_FACTS.testPositives} labelled FLAG = 1 (${(MODEL_FACTS.baseRate * 100).toFixed(1)}%)`}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Reported test metrics</caption>
            <tbody>
              {MODEL_FACTS.metrics.map((m) => (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-3 font-medium">{m.label}<span className="block text-xs font-normal text-muted">{m.hint}</span></th>
                  <td className="py-2 text-right font-display text-xl font-semibold">{m.value.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Confusion matrix" subtitle="At the default threshold of 0.50">
          <table className="w-full text-center text-sm">
            <caption className="sr-only">Counts of customers by label and model prediction</caption>
            <thead>
              <tr><td /><th scope="col" className="py-2 font-medium">Not flagged</th><th scope="col" className="py-2 font-medium">Flagged</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row" className="py-2 text-left font-medium">FLAG = 0</th><td className="border border-line py-3">{c.TN.toLocaleString('en-IN')}</td><td className="border border-line py-3">{c.FP.toLocaleString('en-IN')}</td></tr>
              <tr><th scope="row" className="py-2 text-left font-medium">FLAG = 1</th><td className="border border-line py-3">{c.FN.toLocaleString('en-IN')}</td><td className="border border-line bg-gold py-3 font-semibold">{c.TP.toLocaleString('en-IN')}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-sm text-muted">{c.TP + c.FP} customers were flagged. {c.TP} carried FLAG = 1 and {c.FP} did not. {c.FN} customers carrying FLAG = 1 were not flagged.</p>
        </Panel>

        <Panel title="Model selection" subtitle="Development cross-validation, mean F1 for FLAG = 1">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Candidates compared during development</caption>
            <tbody>
              {MODEL_FACTS.cv.map((r) => (
                <tr key={r.model} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-3 font-medium">{r.model} {r.selected ? <Badge tone="gold" className="ml-1">Selected</Badge> : null}</th>
                  <td className="py-2 text-right">{r.f1.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-muted">Decision Tree and SVM were not evaluated.</p>
        </Panel>
      </div>

      <Panel className="mt-5" title="The 13 inputs" subtitle="Customer-level summaries, in the order the model requires" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Model input features and their verification status</caption>
            <thead className="border-b border-line bg-mist text-muted">
              <tr><th scope="col" className="px-4 py-2.5 font-medium">Feature</th><th scope="col" className="px-4 py-2.5 font-medium">Meaning (inferred from the name)</th><th scope="col" className="px-4 py-2.5 font-medium">Check status</th></tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.name} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2 font-medium">{f.name}</th>
                  <td className="px-4 py-2">{f.note}</td>
                  <td className="px-4 py-2"><Badge tone={f.check === 'identity' ? 'ok' : 'outline'}>{CHECK_LABELS[f.check]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Limitations">
          <ul className="list-disc space-y-2 pl-5 text-sm">{MODEL_FACTS.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </Panel>
        <Panel title="Not confirmed" subtitle="These facts are unknown and are not filled in here">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Unconfirmed dataset facts</caption>
            <tbody>
              {MODEL_FACTS.unconfirmed.map((u) => (
                <tr key={u.item} className="border-b border-line last:border-0"><th scope="row" className="py-2 pr-3 font-medium">{u.item}</th><td className="py-2">{u.status}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  )
}
