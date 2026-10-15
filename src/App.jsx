import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STATUSES = ['Backlog', 'Playing', 'Completed', '100% Completed', 'Abandoned']
const PAGE_SIZE = 24
const THEMES = [
  ['vgui-olive', 'VGUI Olive'], ['source-obsidian', 'Source Obsidian'],
  ['hev-hazard', 'HEV Hazard'], ['lan-party-98', 'LAN Party 98'],
]
const DEFAULT_FORM = { title: '', platform: 'PC', genre: '', year: '', status: 'Backlog', notes: '', cover_image: '' }
const prettyTime = (minutes = 0) => `${Math.floor(minutes / 60).toLocaleString()}h ${minutes % 60}m`

function GameCover({ title, cover, backdrop }) {
  const [brokenSources, setBrokenSources] = useState([])
  const src = [cover, backdrop].find((url) => url && !brokenSources.includes(url)) || ''
  if (!src) return <span className="poster-fallback">{title.slice(0, 1)}</span>
  return <img loading="lazy" src={src} alt={`${title} cover`} onError={() => setBrokenSources((current) => [...current, src])}/>
}

function PageControls({ page, pageCount, total, onChange }) {
  if (total <= PAGE_SIZE) return null
  const start = (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)
  return <div className="pagination"><span>Showing {start}–{end} of {total}</span><div><button className="button" disabled={page === 1} onClick={() => onChange(page - 1)}>‹ Previous</button><strong>Page {page} / {pageCount}</strong><button className="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>Next ›</button></div></div>
}

function App() {
  const publicSteamId = window.location.pathname.match(/^\/u\/(\d{17})\/?$/)?.[1]
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [games, setGames] = useState([])
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('Library')
  const [view, setView] = useState('grid')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [suggestions, setSuggestions] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const catalogSearchController = useRef(null)
  const [supabaseOnline, setSupabaseOnline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [friendId, setFriendId] = useState('')
  const [matches, setMatches] = useState([])
  const [roulette, setRoulette] = useState(null)
  const [selectedGame, setSelectedGame] = useState(null)
  const [gameDetails, setGameDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  const load = useCallback(async () => {
    const [gameResponse, profileResponse, activityResponse] = await Promise.all([
      fetch('/api/games'), fetch('/api/profile'), fetch('/api/activity?limit=100'),
    ])
    if (gameResponse.ok) setGames(await gameResponse.json())
    if (profileResponse.ok) setProfile(await profileResponse.json())
    if (activityResponse.ok) setLogs(await activityResponse.json())
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/health').then((response) => response.json()).then(({ supabase }) => { if (active) setSupabaseOnline(Boolean(supabase)) }).catch(() => {})
    fetch('/api/auth/me').then((response) => response.json()).then(async ({ user: current, profile: currentProfile }) => {
      if (!active) return
      setUser(current)
      setProfile(currentProfile || null)
      if (current) await load()
    }).catch(() => setMessage('RetroVault API is unreachable. Start it with npm run dev:all.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load])

  useEffect(() => {
    document.documentElement.dataset.theme = profile?.preferred_theme || 'vgui-olive'
    const custom = profile?.custom_theme || {}
    for (const [key, cssVar] of Object.entries({ background: '--custom-bg', panel: '--custom-panel', accent: '--custom-accent', text: '--custom-text' })) {
      if (typeof custom[key] === 'string' && /^#[0-9a-f]{6}$/i.test(custom[key])) document.documentElement.style.setProperty(cssVar, custom[key])
      else document.documentElement.style.removeProperty(cssVar)
    }
  }, [profile])

  const stats = useMemo(() => {
    const completed = games.filter((game) => ['Completed', '100% Completed'].includes(game.status)).length
    const playtime = games.reduce((sum, game) => sum + (game.playtime_minutes || 0), 0)
    const backlog = games.filter((game) => game.status === 'Backlog').length
    const backlogHours = games.filter((game) => game.status === 'Backlog').reduce((sum, game) => sum + (Number(game.time_to_beat_hours) || 0), 0)
    const cost = games.reduce((sum, game) => sum + Number(game.purchase_price || 0), 0)
    return { total: games.length, completed, backlog, backlogHours, playtime, cost, completion: games.length ? Math.round(completed / games.length * 100) : 0 }
  }, [games])
  const visible = useMemo(() => games.filter((game) => {
    const matchesQuery = `${game.title} ${game.platform} ${(game.genres || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (status === 'All statuses' || game.status === status)
  }), [games, query, status])
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageGames = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const notifyError = async (response) => {
    const error = await response.json().catch(() => ({}))
    setMessage(error.message || 'Request failed. Please try again.')
  }
  const sync = async () => {
    setSyncing(true); setMessage('Syncing Steam library…')
    try {
      const response = await fetch('/api/steam/library')
      if (!response.ok) return await notifyError(response)
      const result = await response.json(); await load()
      setMessage(`Synced ${result.synced} of ${result.total} Steam games; recorded ${result.playLogs} playtime updates.`)
    } catch { setMessage('Steam sync failed. Check your API key and connection.') }
    finally { setSyncing(false) }
  }
  const addGame = async (event) => {
    event.preventDefault()
    const response = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!response.ok) return notifyError(response)
    const game = await response.json()
    setGames((current) => current.some((item) => item.id === game.id) ? current : [game, ...current])
    setForm(DEFAULT_FORM); setMessage(`${game.title} added to your vault.`)
  }
  const searchCatalog = async (title) => {
    setForm((current) => ({ ...current, title, catalog_id: undefined }))
    catalogSearchController.current?.abort()
    if (title.trim().length < 2) { setSuggestions([]); setCatalogLoading(false); return }
    const controller = new AbortController()
    catalogSearchController.current = controller
    setCatalogLoading(true)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(title.trim())}`, { signal: controller.signal })
      const result = await response.json()
      setSuggestions(response.ok ? result.results || [] : [])
    } catch (error) { if (error.name !== 'AbortError') setSuggestions([]) }
    finally { if (!controller.signal.aborted) setCatalogLoading(false) }
  }
  const selectCatalogGame = (game) => {
    setForm((current) => ({ ...current, catalog_id: game.id, title: game.title, platform: game.platforms?.[0] || current.platform, genre: game.genres?.join(', ') || '', year: game.release_year || '' }))
    setSuggestions([])
  }
  const changeStatus = async (game, nextStatus) => {
    const response = await fetch(`/api/games/${game.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) })
    if (!response.ok) return notifyError(response)
    const updated = await response.json(); setGames((items) => items.map((item) => item.id === game.id ? updated : item))
  }
  const editGame = async (game, changes) => {
    const response = await fetch(`/api/games/${game.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    if (!response.ok) return notifyError(response)
    const updated = await response.json(); setGames((items) => items.map((item) => item.id === game.id ? updated : item))
  }
  const removeGame = async (game) => {
    const response = await fetch(`/api/games/${game.id}`, { method: 'DELETE' })
    if (response.ok) setGames((items) => items.filter((item) => item.id !== game.id))
    else await notifyError(response)
  }
  const saveProfile = async (changes) => {
    const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    if (!response.ok) return notifyError(response)
    setProfile(await response.json()); setMessage('Profile settings saved.')
  }
  const findMatches = async (event) => {
    event.preventDefault()
    const response = await fetch(`/api/lan-matches/${friendId}`)
    if (!response.ok) return notifyError(response)
    setMatches(await response.json()); setMessage('LAN matches updated.')
  }
  const spinBacklog = () => {
    const eligible = games.filter((game) => game.status === 'Backlog')
    setRoulette(eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : null)
    if (!eligible.length) setMessage('Your backlog is empty. Add a game or change a status first.')
  }
  const openDetails = async (game) => {
    setSelectedGame(game); setGameDetails(null); setDetailsError(''); setDetailsLoading(true)
    try {
      const response = await fetch(`/api/games/${game.id}/details`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not load game details.')
      setGameDetails(result)
      setGames((items) => items.map((item) => item.id === game.id ? {
        ...item,
        cover_image: result.artwork_grid_url || item.cover_image,
        backdrop_url: result.artwork_hero_url || result.backdrop_url || item.backdrop_url,
        artwork_logo_url: result.artwork_logo_url || item.artwork_logo_url,
        metacritic_score: result.metacritic_score,
        summary: result.summary || item.summary,
      } : item))
    } catch (error) { setDetailsError(error.message) }
    finally { setDetailsLoading(false) }
  }
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setUser(null); setProfile(null); setGames([]); setLogs([]) }

  if (publicSteamId) return <PublicProfile steamId={publicSteamId} message={message} />
  if (loading) return <main className="boot-screen">RETROVAULT // BOOTING…</main>
  if (!user) return <main className="login-screen"><section className="vgui-window login-window"><header className="titlebar"><b>RetroVault 2.0</b><span>Steam Library System</span></header><div className="login-content"><img className="login-logo" src="/retrovault-logo.svg" alt="RetroVault vault emblem"/><h1>Your games. Your story.</h1><p>Sign in with Steam to sync your library, track playtime, and build your personal vault.</p><a className="button primary" href="/auth/steam">Sign in through Steam</a><small>Steam game details must be public for library sync.</small></div></section></main>

  return <main className="app-shell">
    <header className="vgui-window top-window"><div className="titlebar"><div className="brand-lockup"><img src="/retrovault-logo.svg" alt=""/><span><strong>RetroVault</strong><small>PERSONAL GAME VAULT // STEAM CONNECTED</small></span></div><div className="account-chip">{profile?.avatar_url && <img src={profile.avatar_url} alt="" />}<span>{profile?.username || `Steam ${user.id}`}</span><button className="button small" onClick={logout}>Log out</button></div></div>
      <nav className="tabs">{['Library', 'Activity', 'Social', 'Settings'].map((name) => <button key={name} className={`tab ${tab === name ? 'active' : ''}`} onClick={() => setTab(name)}>{name}</button>)}</nav>
    </header>

    {message && <div className="notice" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}

    {tab === 'Library' && <>
      <section className="stats-grid">{[['IN VAULT', stats.total], ['COMPLETED', `${stats.completed} (${stats.completion}%)`], ['BACKLOG', stats.backlog], ['STEAM PLAYTIME', prettyTime(stats.playtime)]].map(([label, value]) => <div className="vgui-window stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section>
      <section className="library-layout">
        <div className="vgui-window library-window"><div className="section-heading"><div><small>PERSONAL COLLECTION</small><h1>Game Library <span>{visible.length}</span></h1></div><div className="heading-actions"><button className="button" onClick={spinBacklog}>Backlog roulette</button><button className="button primary" disabled={syncing} onClick={sync}>{syncing ? 'Syncing…' : '↻ Sync Steam'}</button></div></div>
          <div className="toolbar"><input aria-label="Search library" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search title, platform, genre…"/><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option>All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select><button className={`button ${view === 'grid' ? 'selected' : ''}`} onClick={() => setView('grid')} title="Poster grid">▦</button><button className={`button ${view === 'list' ? 'selected' : ''}`} onClick={() => setView('list')} title="Compact list">☷</button></div>
          {roulette && <div className="roulette-result">{roulette.artwork_hero_url && <img className="roulette-backdrop" src={roulette.artwork_hero_url} alt=""/>}<div className="roulette-poster"><GameCover title={roulette.title} cover={roulette.cover_image} backdrop={roulette.backdrop_url}/></div><div className="roulette-copy"><small>BACKLOG ROULETTE // TONIGHT&apos;S PICK</small><b>{roulette.title}</b><span>{roulette.platform} · {roulette.year || 'Release year unknown'} · {prettyTime(roulette.playtime_minutes)}</span>{roulette.summary && <p>{roulette.summary.slice(0, 180)}{roulette.summary.length > 180 ? '…' : ''}</p>}<div><button className="button" onClick={() => openDetails(roulette)}>Game details</button>{roulette.steam_app_id && <a className="button primary" href={`steam://run/${roulette.steam_app_id}`}>Launch in Steam ↗</a>}</div></div><button className="roulette-close" onClick={() => setRoulette(null)} aria-label="Close roulette preview">×</button></div>}
          <PageControls page={currentPage} pageCount={pageCount} total={visible.length} onChange={setPage}/>
          {pageGames.length ? <div className={view === 'grid' ? 'game-grid' : 'game-list'}>{pageGames.map((game) => <article className="game-card" key={game.id}>
            <div className="poster"><button type="button" className="poster-trigger" aria-label={`View details for ${game.title}`} onClick={() => openDetails(game)}><GameCover title={game.title} cover={game.cover_image} backdrop={game.backdrop_url}/><span className="poster-view">Details</span></button><button className={`favorite ${game.is_favorite ? 'on' : ''}`} onClick={() => editGame(game, { is_favorite: !game.is_favorite })} title="Toggle favorite">★</button></div>
            <div className="game-info"><button type="button" className="game-title detail-title" onClick={() => openDetails(game)}><b title={game.title}>{game.title}</b><span>{game.year || '—'} · {game.platform}</span></button><select aria-label={`Status for ${game.title}`} value={game.status} onChange={(event) => changeStatus(game, event.target.value)}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select><div className="game-meta"><span>{game.genres?.join(', ') || game.genre || 'Unclassified'}</span><span>{prettyTime(game.playtime_minutes)}</span></div><div className="game-actions"><label>★ <input aria-label={`Rating for ${game.title}`} type="number" min="1" max="10" defaultValue={game.rating || ''} placeholder="Rate" onBlur={(event) => { if (event.target.value) editGame(game, { rating: Number(event.target.value) }) }}/></label><button onClick={() => { const notes = window.prompt('Vault notes', game.notes || ''); if (notes !== null) editGame(game, { notes }) }}>Notes</button><button onClick={() => { const price = window.prompt('Purchase price (number)', game.purchase_price ?? ''); if (price !== null && price !== '') editGame(game, { purchase_price: Number(price) }) }}>Price</button>{game.steam_app_id && <a href={`steam://run/${game.steam_app_id}`}>Play ↗</a>}<button className="delete-action" onClick={() => removeGame(game)} title="Remove from vault">Remove</button></div></div>
          </article>)}</div> : <div className="empty-state">{games.length ? 'No games match those filters.' : 'Your vault is empty. Sync Steam or add your first game.'}</div>}
          <PageControls page={currentPage} pageCount={pageCount} total={visible.length} onChange={setPage}/>
        </div>
        <aside className="vgui-window add-window"><div className="panel-title"><small>MANUAL ENTRY</small><h2>Add a game</h2></div><form onSubmit={addGame} className="add-form"><label>Title<input required value={form.title} onChange={(event) => searchCatalog(event.target.value)} placeholder="Game title"/></label>{catalogLoading && <small className="catalog-hint">Searching catalog…</small>}{suggestions.length > 0 && <div className="suggestions">{suggestions.slice(0, 5).map((game) => <button type="button" key={game.id} onClick={() => selectCatalogGame(game)}><span>{game.title}</span><small>{game.release_year || 'Unknown year'} · {(game.genres || []).join(', ') || 'No genre'}</small></button>)}</div>}<label>Platform<input value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}/></label><label>Genre<input value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })} placeholder="RPG, Action…"/></label><div className="form-row"><label>Year<input type="number" min="1950" max="2200" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} placeholder="—"/></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Cover URL<input type="url" value={form.cover_image} onChange={(event) => setForm({ ...form, cover_image: event.target.value })} placeholder="https://…"/></label><label>Notes<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label><button className="button primary" type="submit">Add to my vault</button></form>
          <div className="vault-audit"><small>VAULT AUDIT</small><p>{stats.backlog} games waiting{stats.backlogHours ? ` · ~${Math.round(stats.backlogHours)}h to beat` : ''} · {stats.cost ? `${stats.cost.toFixed(2)} total purchase cost` : 'Set prices from each game card'}{stats.cost && stats.playtime ? ` · ${(stats.cost / (stats.playtime / 60)).toFixed(2)} per tracked hour` : ''}</p></div>
        </aside>
      </section>
    </>}

    {tab === 'Activity' && <section className="vgui-window content-window"><div className="section-heading"><div><small>SYNCED DELTAS</small><h1>Playtime Activity</h1></div><span>{logs.length} events</span></div>{logs.length ? <div className="activity-list">{logs.map((log) => <article key={log.id}><span className="activity-dot"/><img src={log.catalog?.cover_url || ''} alt=""/><div><b>{log.catalog?.title || 'Unknown game'}</b><small>{new Date(log.happened_at).toLocaleString()} · {log.source}</small></div><strong>+{prettyTime(log.delta_minutes)}</strong></article>)}</div> : <div className="empty-state">Your activity appears after Steam reports new playtime during a sync.</div>}</section>}

    {tab === 'Social' && <section className="social-grid"><article className="vgui-window content-window"><small>PUBLIC PROFILE</small><h1>Share your vault</h1><p>Choose whether your collection can appear on your public RetroVault profile.</p><label className="switch-row"><span>{profile?.is_public ? 'Profile is public' : 'Profile is private'}</span><input type="checkbox" checked={Boolean(profile?.is_public)} onChange={(event) => saveProfile({ is_public: event.target.checked })}/></label>{profile?.is_public && <><a className="button" target="_blank" rel="noreferrer" href={`/u/${user.id}`}>Open public profile</a><div className="snippet"><small>MARKDOWN BADGE</small><code>[![RetroVault]({window.location.origin}/api/badge/{user.id}.svg)]({window.location.origin}/u/{user.id})</code><button className="button small" onClick={() => navigator.clipboard?.writeText(`[![RetroVault](${window.location.origin}/api/badge/${user.id}.svg)](${window.location.origin}/u/${user.id})`)}>Copy snippet</button></div></>}</article>
      <article className="vgui-window content-window"><small>CO-OP COMPATIBILITY</small><h1>LAN Party Matcher</h1><p>Find shared co-op or multiplayer titles between your public profile and a friend’s Steam ID.</p><form className="inline-form" onSubmit={findMatches}><input inputMode="numeric" pattern="[0-9]{17}" required value={friendId} onChange={(event) => setFriendId(event.target.value)} placeholder="17-digit Steam ID"/><button className="button primary">Find games</button></form>{matches.map((game) => <div className="match-row" key={game.id}>{game.cover_url && <img src={game.cover_url} alt=""/>}<b>{game.title}</b><span>{game.co_op ? 'Co-op' : 'Multiplayer'}</span></div>)}</article></section>}

    {tab === 'Settings' && <section className="vgui-window content-window settings-window"><small>CLIENT CONFIGURATION</small><h1>Interface Settings</h1><label className="setting-row"><span><b>VGUI skin</b><small>Saved to your Steam profile and applied locally.</small></span><select value={profile?.preferred_theme || 'vgui-olive'} onChange={(event) => saveProfile({ preferred_theme: event.target.value })}>{THEMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="theme-builder"><h2>Custom skin colors</h2><p>Optional overrides for background, panels, accent, and text. Defaults return when a field is cleared.</p><div className="color-grid">{[['background', 'Background'], ['panel', 'Panel'], ['accent', 'Accent'], ['text', 'Text']].map(([key, label]) => <label key={key}>{label}<input type="color" value={profile?.custom_theme?.[key] || ({ background: '#171914', panel: '#252820', accent: '#a9d4ff', text: '#e5e5dc' })[key]} onChange={(event) => setProfile((current) => ({ ...current, custom_theme: { ...current?.custom_theme, [key]: event.target.value } }))}/></label>)}</div><button className="button primary" onClick={() => saveProfile({ custom_theme: profile.custom_theme || {} })}>Save custom colors</button></div><div className="setting-row"><span><b>Steam account</b><small>{profile?.profile_url || user.id}</small></span><span>{profile?.username || `Steam ${user.id}`}</span></div></section>}

    {selectedGame && <GameDetailsDialog game={selectedGame} details={gameDetails} loading={detailsLoading} error={detailsError} onClose={() => setSelectedGame(null)}/>}
    <footer className="statusbar"><span className={supabaseOnline ? '' : 'offline'}><i/> SUPABASE {supabaseOnline ? 'ONLINE' : 'OFFLINE'}</span><span>{games.length} TITLES · {prettyTime(stats.playtime)} TRACKED</span><span>STEAM ID {user.id}</span></footer>
  </main>
}

export default App

function GameDetailsDialog({ game, details, loading, error, onClose }) {
  const data = details || game
  const screenshots = data.screenshots || []
  const steamUrl = data.steam_app_id ? `https://store.steampowered.com/app/${data.steam_app_id}/` : null
  const gridUrl = `https://www.steamgriddb.com/search/grids?term=${encodeURIComponent(data.title)}`
  return <div className="details-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="vgui-window details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-title">
      <header className="details-header"><div><small>GAME DOSSIER // {data.steam_app_id ? `APP ${data.steam_app_id}` : 'LOCAL ENTRY'}</small><h2 id="details-title">{data.title}</h2></div><button className="button" onClick={onClose} aria-label="Close game details">×</button></header>
      {data.artwork_hero_url && <img className="details-hero" src={data.artwork_hero_url} alt=""/>}
      <div className="details-main"><div className="details-cover"><GameCover title={data.title} cover={data.artwork_grid_url || data.cover_url || data.cover_image} backdrop={data.artwork_hero_url || data.backdrop_url}/>{data.artwork_logo_url && <img className="details-logo" src={data.artwork_logo_url} alt={`${data.title} logo`}/>}</div><div className="details-copy">
        {loading && <div className="detail-loading"><i/> Fetching store info and artwork…</div>}
        {error && <p className="detail-error">{error}</p>}
        <div className="detail-chips"><span>{data.release_year || data.year || 'Release year unknown'}</span><span>{data.platform_played || data.platform || 'PC'}</span><span>{data.status || 'In catalog'}</span>{data.metacritic_score != null && <a className="metacritic-score" href={data.metacritic_url || '#'} target="_blank" rel="noreferrer"><b>{data.metacritic_score}</b><small>METACRITIC</small></a>}</div>
        <div className="detail-facts">{data.developer && <p><b>Developer</b><span>{data.developer}</span></p>}{data.publisher && <p><b>Publisher</b><span>{data.publisher}</span></p>}{data.genres?.length > 0 && <p><b>Genres</b><span>{data.genres.join(' · ')}</span></p>}{data.playtime_minutes > 0 && <p><b>Playtime</b><span>{prettyTime(data.playtime_minutes)}</span></p>}</div>
        <p className="detail-summary">{data.summary || 'No description is available yet.'}</p>
        <div className="detail-links">{steamUrl && <><a className="button primary" href={steamUrl} target="_blank" rel="noreferrer">Steam Store ↗</a><a className="button" href={`steam://run/${data.steam_app_id}`}>Play ↗</a></>}<a className="button" href={gridUrl} target="_blank" rel="noreferrer">More artwork on SteamGridDB ↗</a></div>
      </div></div>
      {screenshots.length > 0 && <div className="details-screenshots"><div><small>SCREENSHOTS</small><span>{screenshots.length} images</span></div><div className="screenshot-strip">{screenshots.map((image, index) => <a key={image} href={image} target="_blank" rel="noreferrer"><img src={image} loading="lazy" alt={`${data.title} screenshot ${index + 1}`}/></a>)}</div></div>}
    </section>
  </div>
}

function PublicProfile({ steamId, message }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`/api/public/profiles/${steamId}`).then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).message || 'Profile unavailable')
      return response.json()
    }).then(setData).catch((reason) => setError(reason.message))
  }, [steamId])
  if (error || message) return <main className="login-screen"><section className="vgui-window content-window"><h1>Profile unavailable</h1><p>{error || message}</p><a href="/">Return to RetroVault</a></section></main>
  if (!data) return <main className="boot-screen">LOADING PUBLIC PROFILE…</main>
  const { profile, games, stats } = data
  return <main className="app-shell"><header className="vgui-window top-window"><div className="titlebar"><div><strong>RetroVault // Public Profile</strong><small>Player collection and stats</small></div><a className="button" href="/">Open RetroVault</a></div></header><section className="vgui-window content-window public-owner">{profile.avatar_url && <img src={profile.avatar_url} alt=""/>}<div><small>STEAM PROFILE</small><h1>{profile.username}</h1>{profile.profile_url && <a href={profile.profile_url} target="_blank" rel="noreferrer">View Steam profile ↗</a>}</div></section><section className="stats-grid">{[['IN VAULT', stats.total], ['COMPLETED', `${stats.completed} (${stats.completionRate}%)`], ['PLAYTIME', prettyTime(stats.playtimeMinutes)], ['MEMBER SINCE', profile.steam_created_at ? new Date(profile.steam_created_at).getFullYear() : 'Steam']].map(([label, value]) => <div className="vgui-window stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section><section className="vgui-window content-window"><div className="section-heading"><div><small>SHARED COLLECTION</small><h1>Games</h1></div><span>{games.length} titles</span></div><div className="game-grid public-game-grid">{games.map((game) => <article className="game-card" key={game.id}><div className="poster"><GameCover title={game.title} cover={game.cover_image} backdrop={game.backdrop_url}/></div><div className="game-info"><div className="game-title"><b>{game.title}</b><span>{game.year || '—'} · {game.platform}</span></div><span>{game.status} · {prettyTime(game.playtime_minutes)}</span>{game.rating && <span>Rating: {game.rating}/10</span>}</div></article>)}</div></section><footer className="statusbar"><span>RETROVAULT PUBLIC PROFILE</span><span>STEAM ID {steamId}</span></footer></main>
}
