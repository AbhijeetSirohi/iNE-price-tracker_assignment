import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

// ─── API ───────────────────────────────────────────────────────────────────────
const API = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatPrice(val) {
  if (val == null) return '—'
  return `₹${Number(val).toLocaleString('en-IN')}`
}

// ─── Micro-components ─────────────────────────────────────────────────────────
function Spinner() { return <span className="spinner" /> }

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

function StatusBadge({ status, attemptNumber }) {
  if (!status) return null
  if (status === 'success' && attemptNumber > 1)
    return <span className="badge badge-amber">retried</span>
  if (status === 'success')
    return <span className="badge badge-success">success</span>
  return <span className="badge badge-failed">failed</span>
}

function StockTag({ stock, qty }) {
  if (!stock || stock === 'unknown') return <span className="td-meta">—</span>
  const isOut = stock === 'out of stock' || stock === 'out_of_stock'
  // Build display label: status + quantity if present
  let label
  if (isOut) {
    label = 'Out of stock'
  } else if (qty != null) {
    label = `${qty} left`
  } else {
    label = 'In stock'
  }
  return <span className={`stock-tag ${isOut ? 'stock-out' : 'stock-in'}`}>{label}</span>
}

// ─── DashboardView ─────────────────────────────────────────────────────────────
function DashboardView({ trackedProducts, loading, error, onRefresh, onViewDetail, onUntrack, onScrape, scrapingIds, cardData }) {
  const total     = trackedProducts.length
  const successful = trackedProducts.filter(t => cardData[t.id]?.log?.status === 'success').length
  const failed    = trackedProducts.filter(t => cardData[t.id]?.log?.status === 'failed').length
  const neverScraped = trackedProducts.filter(t => !cardData[t.id]?.log).length

  return (
    <>
      <div className="main-header">
        <h1 className="main-title">Tracked Products</h1>
        <p className="main-subtitle">
          Prices scraped every 2 hours. Latest validated observation shown — failed scrapes never overwrite good data.
        </p>
      </div>

      <div className="main-body">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-label">Tracking</span>
            <span className="stat-value">{total}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Last scrape OK</span>
            <span className="stat-value stat-value-teal">{successful}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Last scrape failed</span>
            <span className="stat-value stat-value-red">{failed}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Never scraped</span>
            <span className="stat-value stat-value-amber">{neverScraped}</span>
          </div>
        </div>

        {/* Table */}
        <div>
          <div className="section-head" style={{ marginBottom: 10 }}>
            <h2 className="section-title">All products</h2>
            <button className="btn btn-ghost" onClick={onRefresh}>↻ Refresh</button>
          </div>

          {loading && (
            <div className="loading-row"><Spinner /> Loading…</div>
          )}
          {!loading && error && (
            <div className="error-banner">Error: {error}</div>
          )}
          {!loading && !error && trackedProducts.length === 0 && (
            <EmptyState
              icon="📡"
              title="Nothing tracked yet"
              subtitle='Go to "Add product" to find something to track.'
            />
          )}

          {!loading && !error && trackedProducts.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Latest Price</th>
                    <th>Stock</th>
                    <th>Last Scraped</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trackedProducts.map(t => {
                    const p   = t.products
                    const hist = cardData[t.id]?.history
                    const log  = cardData[t.id]?.log
                    return (
                      <tr key={t.id}>
                        <td className="td-name">
                          <button
                            style={{ background: 'none', border: 'none', padding: 0, color: '#2dd4bf', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600 }}
                            onClick={() => onViewDetail(t)}
                          >
                            {p?.name ?? `Product #${p?.store_product_id}`}
                          </button>
                        </td>
                        <td className="td-meta">{p?.brand ?? '—'}</td>
                        <td className="td-price">{formatPrice(hist?.price)}</td>
                        <td><StockTag stock={hist?.stock_status} qty={hist?.stock_quantity} /></td>
                        <td className="td-time">{timeAgo(hist?.scraped_at) ?? '—'}</td>
                        <td><StatusBadge status={log?.status} attemptNumber={log?.attempt_number ?? 1} /></td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-ghost" onClick={() => onViewDetail(t)}>
                              Details
                            </button>
                            <button
                              className="btn btn-teal"
                              onClick={() => onScrape(t)}
                              disabled={scrapingIds.has(t.id)}
                            >
                              {scrapingIds.has(t.id) ? <><Spinner /> Scraping…</> : 'Scrape'}
                            </button>
                            <button className="btn btn-danger" onClick={() => onUntrack(t.id)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── SearchView ────────────────────────────────────────────────────────────────
function SearchView({ onTrackSuccess }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tracking, setTracking] = useState({})
  const debounceRef = useRef(null)

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setError(null); return }
    setLoading(true); setError(null)
    try {
      const data = await apiFetch(`/api/products/search?q=${encodeURIComponent(q)}`)
      setResults(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message); setResults([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 350)
    return () => clearTimeout(debounceRef.current)
  }, [query, search])

  async function handleTrack(product) {
    setTracking(t => ({ ...t, [product.store_product_id]: 'loading' }))
    try {
      await apiFetch('/api/tracked-products', {
        method: 'POST',
        body: JSON.stringify({ storeProductId: product.store_product_id }),
      })
      setTracking(t => ({ ...t, [product.store_product_id]: 'done' }))
      onTrackSuccess()
    } catch (err) {
      setTracking(t => ({ ...t, [product.store_product_id]: 'error' }))
      alert(`Could not track: ${err.message}`)
    }
  }

  return (
    <>
      <div className="main-header">
        <h1 className="main-title">Add Product</h1>
        <p className="main-subtitle">Search the INE mock store by name and start tracking a product.</p>
      </div>

      <div className="main-body">
        <div className="search-bar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by name — e.g. Nordkraft, Speaker, Laptop…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {loading && <div className="loading-row"><Spinner /> Searching…</div>}
        {!loading && error && <div className="error-banner">{error}</div>}
        {!loading && !error && query.trim() && results.length === 0 && (
          <EmptyState icon="🔍" title={`No results for "${query}"`} subtitle="Try a broader keyword." />
        )}

        {results.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(product => {
                  const st = tracking[product.store_product_id]
                  return (
                    <tr key={product.store_product_id}>
                      <td className="td-name">{product.name}</td>
                      <td className="td-meta">{product.brand ?? '—'}</td>
                      <td className="td-meta">{product.category ?? '—'}</td>
                      <td className="td-meta" style={{ fontFamily: 'monospace', fontSize: 11 }}>{product.sku ?? '—'}</td>
                      <td>
                        <button
                          className={`btn ${st === 'done' ? 'btn-success' : 'btn-teal'}`}
                          onClick={() => handleTrack(product)}
                          disabled={st === 'loading' || st === 'done'}
                        >
                          {st === 'loading' ? 'Adding…' : st === 'done' ? '✓ Tracking' : '+ Track'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ─── ActivityView ─────────────────────────────────────────────────────────────
function ActivityView({ trackedProducts }) {
  const [allLogs, setAllLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (trackedProducts.length === 0) {
      void Promise.resolve().then(() => setLoading(false))
      return
    }
    let cancelled = false
    Promise.all(
      trackedProducts.map(t =>
        apiFetch(`/api/tracked-products/${t.id}/logs`)
          .then(logs => (Array.isArray(logs) ? logs : []).map(l => ({ ...l, _product: t.products })))
          .catch(() => [])
      )
    ).then(arrays => {
      if (cancelled) return
      const flat = arrays.flat().sort(
        (a, b) => new Date(b.attempt_timestamp) - new Date(a.attempt_timestamp)
      )
      setAllLogs(flat.slice(0, 150))
    }).catch(err => {
      if (!cancelled) setError(err.message)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [trackedProducts])

  return (
    <>
      <div className="main-header">
        <h1 className="main-title">Activity Log</h1>
        <p className="main-subtitle">Latest 150 scrape attempts across all tracked products.</p>
      </div>

      <div className="main-body">
        {loading && <div className="loading-row"><Spinner /> Loading…</div>}
        {!loading && error && <div className="error-banner">{error}</div>}
        {!loading && !error && allLogs.length === 0 && (
          <EmptyState icon="🕐" title="No activity yet" subtitle="Scrape attempts will appear here once products are tracked and scraped." />
        )}

        {!loading && !error && allLogs.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Timestamp</th>
                  <th>Attempt #</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.map(row => (
                  <tr key={row.id}>
                    <td className="td-name">{row._product?.name ?? '—'}</td>
                    <td className="td-time">{formatDate(row.attempt_timestamp)}</td>
                    <td className="td-center">{row.attempt_number}</td>
                    <td><StatusBadge status={row.status} attemptNumber={row.attempt_number} /></td>
                    <td className="td-mono">{formatPrice(row.observed_price)}</td>
                    <td><StockTag stock={row.observed_stock} qty={row.stock_quantity} /></td>
                    <td className="td-error">{row.error_message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ─── DetailView ───────────────────────────────────────────────────────────────
function DetailView({ tracked, onBack }) {
  const product = tracked.products
  const [history, setHistory] = useState([])
  const [logs, setLogs] = useState([])
  const [histLoading, setHistLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)
  const [histError, setHistError] = useState(null)
  const [logsError, setLogsError] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/tracked-products/${tracked.id}/history`)
      .then(d => { if (!cancelled) setHistory(Array.isArray(d) ? d : []) })
      .catch(e => { if (!cancelled) setHistError(e.message) })
      .finally(() => { if (!cancelled) setHistLoading(false) })
    apiFetch(`/api/tracked-products/${tracked.id}/logs`)
      .then(d => { if (!cancelled) setLogs(Array.isArray(d) ? d : []) })
      .catch(e => { if (!cancelled) setLogsError(e.message) })
      .finally(() => { if (!cancelled) setLogsLoading(false) })
    return () => { cancelled = true }
  }, [tracked.id])

  const latest = history[0]

  return (
    <>
      <div className="main-header">
        <h1 className="main-title">{product?.name}</h1>
        <p className="main-subtitle">
          {[product?.brand, product?.category].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="main-body">
        <button className="btn btn-ghost back-btn" onClick={onBack}>← Back</button>

        {/* Hero */}
        <div className="detail-hero">
          <div className="detail-hero-left">
            <h2 className="detail-hero-name">{product?.name}</h2>
            <p className="detail-hero-meta">
              {[product?.brand, product?.category, product?.sku ? `SKU ${product.sku}` : null].filter(Boolean).join(' · ')}
            </p>
            {product?.url && (
              <p className="detail-hero-meta" style={{ marginTop: 4 }}>
                <a href={product.url} target="_blank" rel="noreferrer" style={{ color: '#2dd4bf', textDecoration: 'none' }}>
                  {product.url}
                </a>
              </p>
            )}
          </div>
          <div className="detail-hero-right">
            <span className="detail-price-label">Latest Price</span>
            <span className="detail-price-big">{formatPrice(latest?.price)}</span>
            {latest?.stock_status && latest.stock_status !== 'unknown' && (
              <StockTag stock={latest.stock_status} qty={latest.stock_quantity} />
            )}
          </div>
        </div>

        {/* Price History */}
        <div>
          <div className="section-head" style={{ marginBottom: 10 }}>
            <h2 className="section-title">Price History</h2>
            <span style={{ fontSize: 12, color: '#475569' }}>{history.length} records</span>
          </div>
          {histLoading && <div className="loading-row"><Spinner /></div>}
          {!histLoading && histError && <div className="error-banner">{histError}</div>}
          {!histLoading && !histError && history.length === 0 && (
            <EmptyState icon="📉" title="No price history yet" />
          )}
          {!histLoading && !histError && history.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Scraped At</th><th>Price</th><th>Stock</th></tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row.id}>
                      <td className="td-time">{formatDate(row.scraped_at)}</td>
                      <td className="td-price">{formatPrice(row.price)}</td>
                      <td><StockTag stock={row.stock_status} qty={row.stock_quantity} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Scrape Logs */}
        <div>
          <div className="section-head" style={{ marginBottom: 10 }}>
            <h2 className="section-title">Scrape Log</h2>
            <span style={{ fontSize: 12, color: '#475569' }}>{logs.length} entries</span>
          </div>
          {logsLoading && <div className="loading-row"><Spinner /></div>}
          {!logsLoading && logsError && <div className="error-banner">{logsError}</div>}
          {!logsLoading && !logsError && logs.length === 0 && (
            <EmptyState icon="🕐" title="No scrape logs yet" />
          )}
          {!logsLoading && !logsError && logs.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Timestamp</th><th>Attempt</th><th>Status</th><th>Price</th><th>Stock</th><th>Error</th></tr>
                </thead>
                <tbody>
                  {logs.map(row => (
                    <tr key={row.id}>
                      <td className="td-time">{formatDate(row.attempt_timestamp)}</td>
                      <td className="td-center">{row.attempt_number}</td>
                      <td><StatusBadge status={row.status} attemptNumber={row.attempt_number} /></td>
                      <td className="td-mono">{formatPrice(row.observed_price)}</td>
                      <td><StockTag stock={row.observed_stock} qty={row.stock_quantity} /></td>
                      <td className="td-error">{row.error_message ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('dashboard')
  const [selectedTracked, setSelectedTracked] = useState(null)

  const [trackedProducts, setTrackedProducts] = useState([])
  const [trackedLoading, setTrackedLoading] = useState(true)
  const [trackedError, setTrackedError] = useState(null)
  const [cardData, setCardData] = useState({})
  const [scrapingIds, setScrapingIds] = useState(new Set())

  const loadTracked = useCallback(async () => {
    setTrackedLoading(true); setTrackedError(null)
    try {
      const list = await apiFetch('/api/tracked-products')
      const products = Array.isArray(list) ? list : []
      setTrackedProducts(products)
      const entries = await Promise.all(
        products.map(async t => {
          const [hist, logs] = await Promise.all([
            apiFetch(`/api/tracked-products/${t.id}/history`).catch(() => []),
            apiFetch(`/api/tracked-products/${t.id}/logs`).catch(() => []),
          ])
          return [t.id, {
            history: Array.isArray(hist) ? hist[0] ?? null : null,
            log:     Array.isArray(logs) ? logs[0] ?? null : null,
          }]
        })
      )
      setCardData(Object.fromEntries(entries))
    } catch (err) {
      setTrackedError(err.message)
    } finally {
      setTrackedLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line
    void loadTracked()
  }, [loadTracked])

  async function handleUntrack(trackedId) {
    if (!confirm('Stop tracking this product?')) return
    try {
      await apiFetch(`/api/tracked-products/${trackedId}`, { method: 'DELETE' })
      await loadTracked()
      if (selectedTracked?.id === trackedId) { setSelectedTracked(null); setView('dashboard') }
    } catch (err) {
      alert(`Could not untrack: ${err.message}`)
    }
  }

  async function handleScrape(tracked) {
    setScrapingIds(s => new Set([...s, tracked.id]))
    try {
      await apiFetch(`/api/tracked-products/${tracked.id}/scrape`, { method: 'POST' })
      const [hist, logs] = await Promise.all([
        apiFetch(`/api/tracked-products/${tracked.id}/history`).catch(() => []),
        apiFetch(`/api/tracked-products/${tracked.id}/logs`).catch(() => []),
      ])
      setCardData(d => ({
        ...d,
        [tracked.id]: {
          history: Array.isArray(hist) ? hist[0] ?? null : null,
          log:     Array.isArray(logs) ? logs[0] ?? null : null,
        },
      }))
    } catch (err) {
      alert(`Scrape failed: ${err.message}`)
    } finally {
      setScrapingIds(s => { const n = new Set(s); n.delete(tracked.id); return n })
    }
  }

  function handleViewDetail(tracked) {
    setSelectedTracked(tracked)
    setView('detail')
  }

  const NAV = [
    { key: 'dashboard', icon: '◈', label: 'Dashboard' },
    { key: 'add',       icon: '+', label: 'Add product' },
    { key: 'activity',  icon: '≡', label: 'Activity' },
  ]

  const activeNav = view === 'detail' ? 'dashboard' : view

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div
            className="sidebar-logo"
            onClick={() => { setView('dashboard'); setSelectedTracked(null) }}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setView('dashboard')}
          >
            <div className="sidebar-logo-icon">📦</div>
            <div>
              <div className="sidebar-logo-text">INE Tracker</div>
              <div className="sidebar-logo-sub">demo.inelabteamdev.com</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Navigation</div>
          {NAV.map(({ key, icon, label }) => (
            <button
              key={key}
              className={`sidebar-btn ${activeNav === key ? 'sidebar-btn-active' : ''}`}
              onClick={() => { setView(key); setSelectedTracked(null) }}
            >
              <span className="sidebar-btn-icon">{icon}</span>
              {label}
              {key === 'dashboard' && trackedProducts.length > 0 && (
                <span className="sidebar-count">{trackedProducts.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          Scraped every 2h
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        {view === 'dashboard' && (
          <DashboardView
            trackedProducts={trackedProducts}
            loading={trackedLoading}
            error={trackedError}
            onRefresh={loadTracked}
            onViewDetail={handleViewDetail}
            onUntrack={handleUntrack}
            onScrape={handleScrape}
            scrapingIds={scrapingIds}
            cardData={cardData}
          />
        )}
        {view === 'add' && (
          <SearchView onTrackSuccess={() => { loadTracked(); setView('dashboard') }} />
        )}
        {view === 'activity' && (
          <ActivityView trackedProducts={trackedProducts} />
        )}
        {view === 'detail' && selectedTracked && (
          <DetailView tracked={selectedTracked} onBack={() => setView('dashboard')} />
        )}
      </main>
    </div>
  )
}
