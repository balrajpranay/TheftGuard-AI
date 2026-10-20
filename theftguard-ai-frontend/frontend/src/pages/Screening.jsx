import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Notice, PageHeader, Panel, Spinner } from '../components/ui'
import { useAppState } from '../state/AppState'
import { useLanguage } from '../context/LanguageContext'
import { parseCsv } from '../lib/csv'
import { downloadCsv } from '../lib/exportCsv'
import { FEATURES, FEATURE_NAMES, NEVER_NULL } from '../data/features'
import { fileSize } from '../lib/format'
import { predictBatch, MlApiError } from '../lib/mlApi'
import { createBatch, listBatches } from '../lib/dbApi'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 20000

function inspect(text, fileName, size) {
  const { headers, rows } = parseCsv(text)
  const missing = FEATURE_NAMES.filter((n) => !headers.includes(n))
  const extra = headers.filter((h) => !FEATURE_NAMES.includes(h) && h !== 'customer_ref')
  const truncated = rows.length > MAX_ROWS
  const used = truncated ? rows.slice(0, MAX_ROWS) : rows
  let nonNumeric = 0
  let negative = 0
  let blankRequired = 0
  let problemRows = 0
  const customers = used.map((row, i) => {
    const features = {}
    let bad = false
    FEATURE_NAMES.forEach((name) => {
      const raw = row[name]
      if (raw === undefined) return
      if (raw === '') {
        features[name] = null
        if (NEVER_NULL.includes(name)) {
          blankRequired++
          bad = true
        }
        return
      }
      const v = Number(raw)
      if (!Number.isFinite(v)) {
        nonNumeric++
        bad = true
        features[name] = null
        return
      }
      if (v < 0) {
        negative++
        bad = true
      }
      features[name] = v
    })
    if (bad) problemRows++
    return {
      id: row.customer_ref || `Row ${i + 1}`,
      group: '—',
      score: null,
      isDemo: false,
      status: 'unscored',
      warnings: [],
      errors: [],
      features,
    }
  })
  return {
    fileName,
    size,
    headers,
    rowCount: rows.length,
    usedRows: used.length,
    truncated,
    missing,
    extra,
    nonNumeric,
    negative,
    blankRequired,
    problemRows,
    customers,
  }
}

function Check({ label, ok, children }) {
  return (
    <li className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted">{children}</p>
      </div>
      <Badge tone={ok ? 'ok' : 'outline'}>{ok ? 'OK' : 'Needs attention'}</Badge>
    </li>
  )
}

export default function Screening() {
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const { loadUploaded, loadScreened, loadDemo, thresholds, loadBatchFromDb, dbConnected } = useAppState()
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  const [stage, setStage] = useState('idle') // idle | reading | checked | screening | screened | error
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [mlError, setMlError] = useState('')
  const [progress, setProgress] = useState(null)
  const [screenedStats, setScreenedStats] = useState(null)
  const [scoredCustomersState, setScoredCustomersState] = useState([])
  const [dragging, setDragging] = useState(false)

  // Persistence state
  const [persistState, setPersistState] = useState('idle') // idle | saving | saved | error
  const [persistError, setPersistError] = useState('')
  const [savedBatchId, setSavedBatchId] = useState('')

  // Historical batches state
  const [historicalBatches, setHistoricalBatches] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingBatchId, setLoadingBatchId] = useState('')
  const [loadingBatchProgress, setLoadingBatchProgress] = useState('')

  const fetchHistoricalBatches = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await listBatches({ limit: 10 })
      if (Array.isArray(data)) {
        setHistoricalBatches(data)
      }
    } catch {
      // Non-blocking fallback if database is offline or not configured
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    fetchHistoricalBatches()
  }, [fetchHistoricalBatches])

  async function handleFile(file) {
    if (!file) return
    setError('')
    setMlError('')
    setInfo(null)
    setScreenedStats(null)
    setScoredCustomersState([])
    setPersistState('idle')
    setPersistError('')
    setSavedBatchId('')

    if (!/\.csv$/i.test(file.name)) {
      setStage('error')
      setError('This is not a .csv file. Export your data as CSV (comma separated) and choose it again.')
      return
    }
    if (file.size > MAX_BYTES) {
      setStage('error')
      setError(`This file is ${fileSize(file.size)}. This preview reads files up to 10 MB. Split the file and try again.`)
      return
    }
    setStage('reading')
    try {
      const text = await file.text()
      const result = inspect(text, file.name, file.size)
      if (!result.headers.length || result.rowCount === 0) {
        setStage('error')
        setError('The file has no data rows. Check that the first row holds column names and the rows below hold values.')
        return
      }
      setInfo(result)
      setStage('checked')
    } catch {
      setStage('error')
      setError('The file could not be read. Try exporting it again.')
    }
  }

  async function handleScreenWithModel() {
    if (!info || !info.customers.length) return
    setMlError('')
    setStage('screening')
    setProgress({ completedRows: 0, totalRows: info.customers.length, chunkIndex: 1, totalChunks: 1 })
    setPersistState('idle')
    setPersistError('')
    setSavedBatchId('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const out = await predictBatch(info.customers, {
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      })

      const scoredCustomers = info.customers.map((c, i) => {
        const item = out.results[i]
        if (!item) {
          return { ...c, score: null, status: 'unscored', warnings: [], errors: [] }
        }
        if (item.ok) {
          return {
            ...c,
            score: item.model_score,
            predicted_label: item.predicted_label,
            label_name: item.label_name,
            status: 'scored',
            warnings: item.warnings || [],
            errors: [],
          }
        }
        return {
          ...c,
          score: null,
          predicted_label: null,
          label_name: null,
          status: 'rejected',
          warnings: item.warnings || [],
          errors: item.errors || [],
        }
      })

      let warnCount = 0
      scoredCustomers.forEach((c) => {
        if (c.warnings && c.warnings.length > 0) warnCount++
      })

      const stats = {
        total: out.total,
        scored: out.scored,
        rejected: out.rejected,
        warnCount,
        modelSha: out.model_sha256,
      }

      setScreenedStats(stats)
      setScoredCustomersState(scoredCustomers)
      setStage('screened')

      loadScreened(info.fileName, scoredCustomers, stats)
    } catch (err) {
      if (err instanceof MlApiError && err.code === 'cancelled') {
        setStage('checked')
        setMlError('Screening was cancelled.')
      } else {
        setStage('checked')
        setMlError(err.message || 'An error occurred while connecting to the ML service.')
      }
    } finally {
      abortRef.current = null
    }
  }

  async function handleSaveBatch() {
    if (!info || !screenedStats || persistState === 'saving' || persistState === 'saved') return
    setPersistState('saving')
    setPersistError('')

    try {
      const batchRes = await createBatch({
        fileName: info.fileName,
        modelSha256: screenedStats.modelSha,
        totalRows: screenedStats.total,
        scoredRows: screenedStats.scored,
        rejectedRows: screenedStats.rejected,
        warningRows: screenedStats.warnCount,
        thresholdElevated: thresholds.elevated,
        thresholdReview: thresholds.review,
        records: scoredCustomersState,
      })

      setPersistState('saved')
      setSavedBatchId(batchRes.id)

      // Map child records back so each has screeningRecordId and batchId
      const recordMap = new Map()
      if (Array.isArray(batchRes.records)) {
        batchRes.records.forEach((r) => recordMap.set(r.row_index, r.id))
      }

      const updatedCustomers = scoredCustomersState.map((c, i) => ({
        ...c,
        screeningRecordId: recordMap.get(i) || null,
        batchId: batchRes.id,
      }))

      setScoredCustomersState(updatedCustomers)
      loadScreened(info.fileName, updatedCustomers, {
        ...screenedStats,
        batchId: batchRes.id,
        isPersisted: true,
      })

      fetchHistoricalBatches()
    } catch (err) {
      setPersistState('error')
      setPersistError(err.message || 'Failed to persist batch.')
    }
  }

  async function handleLoadHistoricalBatch(batchId) {
    setLoadingBatchId(batchId)
    setLoadingBatchProgress('')
    setError('')
    try {
      await loadBatchFromDb(batchId, {
        onProgress: ({ loadedRows, totalRows }) => {
          if (totalRows > 100) {
            setLoadingBatchProgress(`(${loadedRows}/${totalRows})`)
          }
        },
      })
      navigate('/app/results')
    } catch (err) {
      setError(`Failed to load historical batch: ${err.message}`)
    } finally {
      setLoadingBatchId('')
      setLoadingBatchProgress('')
    }
  }

  function handleCancelScreening() {
    if (abortRef.current) {
      abortRef.current.abort()
    }
  }

  const reset = () => {
    setStage('idle')
    setInfo(null)
    setError('')
    setMlError('')
    setProgress(null)
    setScreenedStats(null)
    setScoredCustomersState([])
    setPersistState('idle')
    setPersistError('')
    setSavedBatchId('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const downloadTemplate = () =>
    downloadCsv(
      'theftguard-screening-template.csv',
      [{ key: 'customer_ref', label: 'customer_ref' }, ...FEATURE_NAMES.map((n) => ({ key: n, label: n }))],
      [],
    )

  return (
    <>
      <PageHeader title={t('screening.title')}>
        {t('screening.subtitle')}
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <Panel title="Choose a CSV file">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                handleFile(e.dataTransfer.files?.[0])
              }}
              className={`rounded border-2 border-dashed px-6 py-10 text-center ${
                dragging ? 'border-ink bg-pale' : 'border-line bg-mist/50'
              }`}
            >
              <p className="font-display text-lg font-semibold">Drop a .csv file here</p>
              <p className="mt-1 text-sm text-muted">or</p>
              <input
                ref={inputRef}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Button variant="primary" className="mt-3" icon="upload" onClick={() => inputRef.current?.click()}>
                Choose a CSV file
              </Button>
              <p className="mt-3 text-xs text-muted">
                Up to 10 MB. The optional customer_ref column is kept for display and is never used as a model input.
              </p>
            </div>
            {stage === 'reading' ? (
              <div className="mt-4">
                <Spinner label="Reading and checking the file" />
              </div>
            ) : null}
            {stage === 'error' ? (
              <Notice tone="danger" title="This file cannot be used" className="mt-4">
                {error}
              </Notice>
            ) : null}
          </Panel>

          {(stage === 'checked' || stage === 'screening' || stage === 'screened') && info ? (
            <>
              <Panel
                title="File check"
                subtitle={`${info.fileName}, ${fileSize(info.size)}, ${info.rowCount.toLocaleString('en-IN')} data rows`}
                actions={
                  <Button size="sm" onClick={reset} disabled={stage === 'screening'}>
                    Choose a different file
                  </Button>
                }
              >
                <ul>
                  <Check label="Required columns" ok={info.missing.length === 0}>
                    {info.missing.length === 0
                      ? 'All 13 model feature columns are present.'
                      : `Missing: ${info.missing.join(', ')}.`}
                  </Check>
                  <Check label="Other columns" ok={info.extra.length === 0}>
                    {info.extra.length === 0
                      ? 'No unexpected columns.'
                      : `Unexpected: ${info.extra.slice(0, 6).join(', ')}${
                          info.extra.length > 6 ? '…' : ''
                        }. The ML service rejects columns that are not model features, so remove them or keep only customer_ref.`}
                  </Check>
                  <Check label="Numbers" ok={info.nonNumeric === 0 && info.negative === 0}>
                    {info.nonNumeric === 0 && info.negative === 0
                      ? 'Every value is a number of 0 or more.'
                      : `${info.nonNumeric} values are not numbers and ${info.negative} are negative.`}
                  </Check>
                  <Check label="Empty cells in required columns" ok={info.blankRequired === 0}>
                    {info.blankRequired === 0
                      ? 'None. Empty cells are only allowed in the eight statistic columns.'
                      : `${info.blankRequired} empty cells in columns that cannot be empty (${NEVER_NULL.join(', ')}).`}
                  </Check>
                  {info.truncated ? (
                    <Check label="Row limit" ok={false}>
                      The preview reads the first {MAX_ROWS.toLocaleString('en-IN')} rows only.
                    </Check>
                  ) : null}
                </ul>
                <p className="mt-3 text-xs text-muted">
                  {info.problemRows} of {info.usedRows.toLocaleString('en-IN')} rows have at least one issue in the basic
                  check. The ML service applies complete validation rules before scoring each row.
                </p>
              </Panel>

              {mlError ? (
                <Notice tone="danger" title="ML Service Notice" className="mt-4">
                  <p>{mlError}</p>
                  <p className="mt-2 text-xs">
                    To start the ML service locally, run in your terminal:
                    <br />
                    <code className="mt-1 block rounded bg-white px-2 py-1 font-mono text-xs">
                      python -m uvicorn service.main:app --port 8000
                    </code>
                  </p>
                </Notice>
              ) : null}

              {stage === 'screening' ? (
                <Panel title="Screening in progress">
                  <div className="space-y-4">
                    <Spinner
                      label={`Scoring rows: ${progress?.completedRows || 0} of ${progress?.totalRows || info.usedRows} (Chunk ${
                        progress?.chunkIndex || 1
                      } of ${progress?.totalChunks || 1})...`}
                    />
                    <div className="flex gap-3">
                      <Button size="sm" onClick={handleCancelScreening}>
                        Cancel screening
                      </Button>
                    </div>
                  </div>
                </Panel>
              ) : stage === 'screened' && screenedStats ? (
                <Panel title="Screening complete" subtitle={`File: ${info.fileName}`}>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded border border-line bg-mist/50 p-3">
                        <p className="text-xs text-muted">Total rows</p>
                        <p className="font-display text-2xl font-bold">{screenedStats.total}</p>
                      </div>
                      <div className="rounded border border-line bg-mist/50 p-3">
                        <p className="text-xs text-muted">Scored successfully</p>
                        <p className="font-display text-2xl font-bold text-ink">{screenedStats.scored}</p>
                      </div>
                      <div className="rounded border border-line bg-mist/50 p-3">
                        <p className="text-xs text-muted">Rejected (validation)</p>
                        <p
                          className={`font-display text-2xl font-bold ${
                            screenedStats.rejected > 0 ? 'text-danger' : 'text-muted'
                          }`}
                        >
                          {screenedStats.rejected}
                        </p>
                      </div>
                      <div className="rounded border border-line bg-mist/50 p-3">
                        <p className="text-xs text-muted">With warnings</p>
                        <p
                          className={`font-display text-2xl font-bold ${
                            screenedStats.warnCount > 0 ? 'text-gold' : 'text-muted'
                          }`}
                        >
                          {screenedStats.warnCount}
                        </p>
                      </div>
                    </div>

                    <Notice tone="info" title="Model Score interpretation">
                      Model Scores are uncalibrated vote fractions from the trained Random Forest pipeline. They represent
                      similarity to historical flagged patterns, not verified proof of theft.
                    </Notice>

                    {/* Database Persistence Box */}
                    <div className="rounded border border-line bg-pale/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Database Persistence</p>
                          <p className="text-xs text-muted">
                            {persistState === 'saved'
                              ? `Batch persisted to database (ID: ${savedBatchId.slice(0, 8)}...). Individual records are linked for investigations.`
                              : 'Save this screening batch and its scored records to PostgreSQL for audit tracking.'}
                          </p>
                        </div>
                        {persistState === 'saved' ? (
                          <Badge tone="ok">Batch Saved to DB</Badge>
                        ) : persistState === 'saving' ? (
                          <Spinner label="Persisting batch..." />
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            icon="upload"
                            onClick={handleSaveBatch}
                          >
                            Save batch to database
                          </Button>
                        )}
                      </div>
                      {persistState === 'error' ? (
                        <Notice tone="danger" title="Persistence Error" className="mt-3">
                          <p>{persistError}</p>
                          <div className="mt-2">
                            <Button size="sm" onClick={handleSaveBatch}>
                              Retry save
                            </Button>
                          </div>
                        </Notice>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button variant="primary" icon="table" onClick={() => navigate('/app/results')}>
                        View results in table
                      </Button>
                      <Button onClick={() => setStage('checked')}>Screen again</Button>
                    </div>
                  </div>
                </Panel>
              ) : (
                <Panel title="Actions">
                  <p className="text-sm text-muted">
                    Choose how you want to proceed with the checked data rows:
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      variant="primary"
                      disabled={info.missing.length > 0}
                      onClick={handleScreenWithModel}
                    >
                      Screen with ML model
                    </Button>
                    <Button
                      disabled={info.missing.length > 0}
                      onClick={() => {
                        loadUploaded(info.fileName, info.customers)
                        navigate('/app/results')
                      }}
                    >
                      Preview my rows without scoring
                    </Button>
                    <Button
                      onClick={() => {
                        loadDemo()
                        navigate('/app/results')
                      }}
                    >
                      View demonstration results
                    </Button>
                  </div>
                  {info.missing.length > 0 ? (
                    <p className="mt-2 text-sm text-muted">
                      Add the missing columns before submitting rows for screening.
                    </p>
                  ) : null}
                </Panel>
              )}
            </>
          ) : null}

          {/* Historical Batches Panel */}
          <Panel
            title="Historical screening batches"
            subtitle="Batches saved in the database"
            actions={
              <Button size="sm" onClick={fetchHistoricalBatches} disabled={loadingHistory}>
                {loadingHistory ? 'Refreshing...' : 'Refresh'}
              </Button>
            }
          >
            {loadingHistory && historicalBatches.length === 0 ? (
              <Spinner label="Loading saved batches from database..." />
            ) : historicalBatches.length === 0 ? (
              <p className="text-sm text-muted">
                No saved batches found. Score a CSV file and choose "Save batch to database" to persist screening records.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">File name</th>
                      <th scope="col" className="px-3 py-2 font-medium">Saved</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Scored / Total</th>
                      <th scope="col" className="px-3 py-2 font-medium">Version</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalBatches.map((b) => (
                      <tr key={b.id} className="border-b border-line last:border-0 hover:bg-mist/30">
                        <td className="px-3 py-2.5 font-medium">{b.file_name}</td>
                        <td className="px-3 py-2.5 text-xs text-muted">
                          {new Date(b.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                          {b.scored_rows} / {b.total_rows}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted">{b.model_version}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            size="sm"
                            disabled={loadingBatchId === b.id}
                            onClick={() => handleLoadHistoricalBatch(b.id)}
                          >
                            {loadingBatchId === b.id ? `Loading ${loadingBatchProgress || ''}...` : 'Load into results'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title="Required columns"
            subtitle="In this order, with these exact names"
            actions={<Button size="sm" icon="download" onClick={downloadTemplate}>CSV template</Button>}
            bodyClassName="p-0"
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">The 13 model feature columns</caption>
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Column</th>
                  <th scope="col" className="px-4 py-2 font-medium">Can be empty</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f) => (
                  <tr key={f.name} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-2 font-medium">{f.name}</th>
                    <td className="px-4 py-2">{f.nullable ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="ML service integration">
            <p className="text-sm text-muted">
              The ML service runs pure-Python input validation against every row, processes inputs in batches through the
              trained Random Forest pipeline, and assigns a Model Score (0.00 to 1.00) and any rule warnings. Invalid
              rows are rejected with specific error codes rather than guessed or defaulted.
            </p>
          </Panel>
        </div>
      </div>
    </>
  )
}
