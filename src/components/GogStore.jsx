import { useEffect, useState } from 'react'
import StorePrice from './StorePrice.jsx'

const shelves = [['bestsellers', 'Bestsellers'], ['classics', 'Classics'], ['new', 'New on GOG'], ['deals', 'Deals']]
const request = async (url, options) => {
  const response = await fetch(url, options)
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('GOG store is unavailable. Restart the RetroVault server after updating it.')
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Could not load GOG games.')
  return data
}

export default function GogStore({ onOpen, onAdd, games, navigate, Cover }) {
  const [shelf, setShelf] = useState('bestsellers')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState(null)
  const [actionError, setActionError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    request(`/api/store/gog?category=${shelf}&page=${page}`, { signal: controller.signal })
      .then(setData).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [shelf, page, refresh])
  const browse = (category, nextPage = 1) => { setLoading(true); setError(''); setActionError(''); setShelf(category); setPage(nextPage); setRefresh((current) => current + 1) }
  const select = async (game, add) => {
    setAction(game.id); setActionError('')
    try {
      const catalog = await request(`/api/store/gog/${game.id}/catalog`, { method: 'POST' })
      if (add) await onAdd({ ...catalog, platform: 'GOG' })
      else onOpen(catalog)
    } catch (failure) { setActionError(failure.message) }
    finally { setAction(null) }
  }
  return <section className="vgui-window content-window steam-store-window gog-store-window">
    <div className="steam-store-hero"><div><small>GOG STORE / DRM-FREE DISCOVERIES</small><h1>Great games never get old.</h1><p>Rediscover a classic, explore new worlds, and find your next deal.</p></div><div className="heading-actions"><button className="button" onClick={() => navigate('My Profile')}>Connect / sync GOG</button><button className="button" onClick={() => browse(shelf, page)}>↻ Refresh</button></div></div>
    <div className="steam-store-toolbar"><div className="steam-store-tabs">{shelves.map(([value, label]) => <button key={value} className={`steam-store-tab ${value === shelf ? 'active' : ''}`} aria-pressed={value === shelf} onClick={() => browse(value)}>{label}</button>)}</div><a href="https://www.gog.com/" target="_blank" rel="noreferrer">Open GOG ↗</a></div>
    <p className="store-price-note">Prices for Romania, in the currency supplied by GOG. Offers refresh every 10 minutes; the checkout price is final.</p>
    {actionError && <div className="notice" role="alert">{actionError}</div>}
    {loading ? <div className="empty-state" role="status">Loading GOG games and current prices…</div> : error ? <div className="empty-state" role="alert">{error}<button className="button" onClick={() => browse(shelf, page)}>Retry</button></div> : <>
      <div className="steam-store-grid">{(data?.games || []).map((game) => {
        const inVault = games.some((owned) => String(owned.gog_product_id) === game.id)
        return <article className="steam-product-card" key={game.id}>
          <button className="steam-product-image" disabled={Boolean(action)} onClick={() => select(game, false)} aria-label={`View ${game.title}`}><Cover game={{ ...game, cover_image: game.cover_url }}/></button>
          <div className="steam-product-copy"><small>GOG · {game.release_year || 'Release year unknown'} · DRM-FREE</small><h2><button className="text-button" disabled={Boolean(action)} onClick={() => select(game, false)}>{game.title}</button></h2><p>{game.genres.slice(0, 3).join(' / ')}</p><StorePrice game={game}/><div className="steam-product-actions"><button className="button" disabled={Boolean(action)} onClick={() => select(game, false)}>{action === game.id ? 'Loading…' : 'Details'}</button><button className="button primary" disabled={Boolean(action) || inVault} onClick={() => select(game, true)}>{inVault ? 'In your vault' : '+ Backlog'}</button><a className="button small" href={game.store_url} target="_blank" rel="noreferrer">Buy on GOG ↗</a></div></div>
        </article>
      })}</div>
      {!data?.games?.length && <div className="empty-state">No games on this shelf right now.</div>}
      <div className="page-controls"><button className="button" disabled={page === 1} onClick={() => browse(shelf, page - 1)}>Previous</button><span>Page {page}</span><button className="button" disabled={!data?.hasMore} onClick={() => browse(shelf, page + 1)}>Next</button></div>
    </>}
  </section>
}
