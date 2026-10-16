import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { THEMES, THEME_VARIABLES } from '../shared/themes.js'
import { HomePage, ProfilePage, ThemePicker } from './components/VaultPages.jsx'
import GogStore from './components/GogStore.jsx'
import StorePrice from './components/StorePrice.jsx'
import useGogAccount from './useGogAccount.js'

const STATUSES = ['Backlog', 'Playing', 'Completed', '100% Completed', 'Abandoned']
const PAGE_SIZE = 24
const CONSOLE_PLATFORMS = [
  'PC', 'Steam Deck', 'PlayStation 5', 'PlayStation 4', 'PlayStation 3', 'PlayStation 2', 'PlayStation', 'PSP', 'PS Vita',
  'Xbox Series X/S', 'Xbox One', 'Xbox 360', 'Xbox', 'Nintendo Switch', 'Wii U', 'Wii', 'GameCube', 'Nintendo 64',
  'Super Nintendo (SNES)', 'Nintendo Entertainment System (NES)', 'Game Boy Advance', 'Game Boy Color', 'Game Boy', 'Nintendo DS', 'Nintendo 3DS',
  'Sega Dreamcast', 'Sega Saturn', 'Sega Genesis / Mega Drive', 'Sega Master System', 'Sega Game Gear', 'Arcade', 'Android', 'iOS', 'Other',
]
const PLATFORM_GROUPS = [
  { name: 'PC & Handheld', platforms: ['PC', 'Steam Deck', 'Android', 'iOS'] },
  { name: 'PlayStation', platforms: ['PlayStation 5', 'PlayStation 4', 'PlayStation 3', 'PlayStation 2', 'PlayStation', 'PSP', 'PS Vita'] },
  { name: 'Xbox', platforms: ['Xbox Series X/S', 'Xbox One', 'Xbox 360', 'Xbox'] },
  { name: 'Nintendo', platforms: ['Nintendo Switch', 'Wii U', 'Wii', 'GameCube', 'Nintendo 64', 'Super Nintendo (SNES)', 'Nintendo Entertainment System (NES)', 'Game Boy Advance', 'Game Boy Color', 'Game Boy', 'Nintendo DS', 'Nintendo 3DS'] },
  { name: 'Sega', platforms: ['Sega Dreamcast', 'Sega Saturn', 'Sega Genesis / Mega Drive', 'Sega Master System', 'Sega Game Gear'] },
  { name: 'Arcade', platforms: ['Arcade'] },
]
const GAME_STORES = [
  { name: 'Steam', mark: 'S', description: 'Live top sellers, most played, new releases, and deals.', url: 'https://store.steampowered.com/', internal: true },
  { name: 'Epic Games Store', mark: 'E', description: 'PC releases, weekly free games, and seasonal sales.', url: 'https://store.epicgames.com/' },
  { name: 'GOG.com', mark: 'G', description: 'Classics, DRM-free releases, live deals, and library sync.', url: 'https://www.gog.com/', internal: true },
  { name: 'PlayStation Store', mark: 'PS', description: 'Digital games and add-ons for PlayStation consoles.', url: 'https://store.playstation.com/' },
  { name: 'Xbox Store', mark: 'X', description: 'Xbox and Windows PC games from Microsoft.', url: 'https://www.xbox.com/games/store' },
  { name: 'Nintendo eShop', mark: 'N', description: 'Digital games for Nintendo Switch consoles.', url: 'https://www.nintendo.com/us/store/' },
  { name: 'itch.io', mark: 'i', description: 'Indie games, experiments, and game jams.', url: 'https://itch.io/games' },
  { name: 'Humble Store', mark: 'H', description: 'PC games, bundles, and publisher offers.', url: 'https://www.humblebundle.com/store' },
]
const STEAM_STORE_CATEGORIES = [
  ['top_sellers', 'Top sellers'], ['most_played', 'Most played'], ['new_releases', 'New releases'], ['specials', 'Specials'],
]
const DISCOVERY_GENRES = ['Action', 'Adventure', 'RPG', 'Shooter', 'Strategy', 'Puzzle', 'Racing', 'Sports', 'Simulation', 'Platformer', 'Fighting', 'Horror', 'Indie']
const DEFAULT_FORM = { title: '', platform: 'PC', genre: '', year: '', status: 'Backlog', notes: '', cover_image: '' }
const prettyTime = (minutes = 0) => `${Math.floor(minutes / 60).toLocaleString()}h ${minutes % 60}m`
const readJsonResponse = async (response) => {
  if (response.headers.get('content-type')?.includes('application/json')) return response.json()
  await response.text()
  if (response.status === 404) throw new Error('The RetroVault details API is outdated. Restart the local API server and try again.')
  throw new Error(`The RetroVault API returned an unexpected response (HTTP ${response.status}).`)
}

function GameCover({ title, cover, backdrop }) {
  const [brokenSources, setBrokenSources] = useState([])
  const src = [cover, backdrop].find((url) => url && !brokenSources.includes(url)) || ''
  if (!src) return <span className="poster-fallback">{title.slice(0, 1)}</span>
  return <img loading="lazy" src={src} alt={`${title} cover`} onError={() => setBrokenSources((current) => [...current, src])}/>
}

function AchievementsPage({ games }) {
  const steamGames = useMemo(() => games.filter((game) => game.steam_app_id).sort((a, b) => a.title.localeCompare(b.title)), [games])
  const [source, setSource] = useState('steam')
  const [steamGameId, setSteamGameId] = useState(() => String(games.filter((game) => game.steam_app_id).sort((a, b) => a.title.localeCompare(b.title))[0]?.steam_app_id || ''))
  const [steamSearch, setSteamSearch] = useState('')
  const [retroSearch, setRetroSearch] = useState('')
  const [steamData, setSteamData] = useState(null)
  const [steamLoading, setSteamLoading] = useState(false)
  const [steamError, setSteamError] = useState('')
  const [retroUsername, setRetroUsername] = useState(() => window.localStorage.getItem('retrovault-retroachievements-username') || '')
  const [activeRetroUsername, setActiveRetroUsername] = useState(() => window.localStorage.getItem('retrovault-retroachievements-username') || '')
  const [retroRefresh, setRetroRefresh] = useState(0)
  const [retroGames, setRetroGames] = useState([])
  const [retroTotal, setRetroTotal] = useState(0)
  const [retroSelectedId, setRetroSelectedId] = useState('')
  const [retroData, setRetroData] = useState(null)
  const [retroLoading, setRetroLoading] = useState(false)
  const [retroLoadingMore, setRetroLoadingMore] = useState(false)
  const [retroError, setRetroError] = useState('')
  const [filter, setFilter] = useState('all')
  const [achievementSearch, setAchievementSearch] = useState('')

  useEffect(() => {
    if (retroUsername) return
    const controller = new AbortController()
    fetch('/api/achievements/retro/config', { signal: controller.signal }).then(async (response) => {
      const result = await readJsonResponse(response)
      if (!response.ok || !result.username) return
      window.localStorage.setItem('retrovault-retroachievements-username', result.username)
      setRetroUsername(result.username)
      setActiveRetroUsername(result.username)
    }).catch((error) => { if (error.name !== 'AbortError') return })
    return () => controller.abort()
  }, [retroUsername])

  useEffect(() => {
    if (source !== 'steam' || !steamGameId) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setSteamLoading(true)
      setSteamError('')
      setSteamData(null)
      fetch(`/api/achievements/steam/${encodeURIComponent(steamGameId)}`, { signal: controller.signal }).then(async (response) => {
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || 'Could not load Steam achievements.')
        setSteamData(result)
      }).catch((error) => { if (error.name !== 'AbortError') setSteamError(error.message) })
        .finally(() => { if (!controller.signal.aborted) setSteamLoading(false) })
    })
    return () => controller.abort()
  }, [source, steamGameId])

  useEffect(() => {
    if (source !== 'retro' || !activeRetroUsername) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setRetroLoading(true)
      setRetroError('')
      setRetroGames([])
      setRetroData(null)
      fetch(`/api/achievements/retro?username=${encodeURIComponent(activeRetroUsername)}&count=100&offset=0`, { signal: controller.signal }).then(async (response) => {
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || 'Could not load RetroAchievements progress.')
        setRetroGames(result.results || [])
        setRetroTotal(Number(result.total) || 0)
        const firstGame = (result.results || []).find((game) => game.numAwarded > 0) || result.results?.[0]
        if (firstGame) setRetroSelectedId(String(firstGame.gameId))
      }).catch((error) => { if (error.name !== 'AbortError') setRetroError(error.message) })
        .finally(() => { if (!controller.signal.aborted) setRetroLoading(false) })
    })
    return () => controller.abort()
  }, [source, activeRetroUsername, retroRefresh])

  useEffect(() => {
    if (source !== 'retro' || !activeRetroUsername || !retroSelectedId) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setRetroLoading(true)
      setRetroError('')
      setRetroData(null)
      fetch(`/api/achievements/retro/${encodeURIComponent(retroSelectedId)}?username=${encodeURIComponent(activeRetroUsername)}`, { signal: controller.signal }).then(async (response) => {
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || 'Could not load achievements for this game.')
        setRetroData(result)
      }).catch((error) => { if (error.name !== 'AbortError') setRetroError(error.message) })
        .finally(() => { if (!controller.signal.aborted) setRetroLoading(false) })
    })
    return () => controller.abort()
  }, [source, activeRetroUsername, retroSelectedId])

  const activeData = source === 'steam' ? (steamGameId ? steamData : null) : (retroSelectedId ? retroData : null)
  const activeLoading = source === 'steam' ? steamLoading : retroLoading
  const activeError = source === 'steam' ? steamError : retroError
  const achievements = activeData?.achievements || []
  const completedCount = Number(activeData?.completed) || 0
  const totalCount = Number(activeData?.total) || 0
  const filteredAchievements = achievements.filter((achievement) => {
    const completed = source === 'steam' ? achievement.achieved : achievement.achieved
    const matchesFilter = filter === 'all' || (filter === 'completed' ? completed : !completed)
    const matchesSearch = `${achievement.title} ${achievement.description}`.toLocaleLowerCase().includes(achievementSearch.toLocaleLowerCase())
    return matchesFilter && matchesSearch
  })
  const visibleSteamGames = steamGames.filter((game) => game.title.toLocaleLowerCase().includes(steamSearch.toLocaleLowerCase()))
  const visibleRetroGames = retroGames.filter((game) => `${game.title} ${game.consoleName}`.toLocaleLowerCase().includes(retroSearch.toLocaleLowerCase()))
  const selectedRetroGame = retroGames.find((game) => String(game.gameId) === retroSelectedId)

  const connectRetroAccount = (event) => {
    event.preventDefault()
    const username = retroUsername.trim()
    if (!username) return
    window.localStorage.setItem('retrovault-retroachievements-username', username)
    setRetroUsername(username)
    setRetroSelectedId('')
    setActiveRetroUsername(username)
    setRetroRefresh((current) => current + 1)
  }
  const loadMoreRetroGames = async () => {
    setRetroLoadingMore(true)
    setRetroError('')
    try {
      const response = await fetch(`/api/achievements/retro?username=${encodeURIComponent(activeRetroUsername)}&count=100&offset=${retroGames.length}`)
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not load more RetroAchievements games.')
      setRetroGames((current) => [...current, ...(result.results || [])])
      setRetroTotal(Number(result.total) || 0)
    } catch (error) { setRetroError(error.message) }
    finally { setRetroLoadingMore(false) }
  }

  return <section className="vgui-window content-window achievements-window">
    <div className="section-heading"><div><small>PLAYER MILESTONES // STEAM + RETROARCH</small><h1>Achievements</h1><p>See what you have unlocked and what is still waiting in your games.</p></div><span>{steamGames.length} Steam games linked</span></div>
    <div className="achievement-source-tabs" role="tablist" aria-label="Achievement source">
      <button role="tab" aria-selected={source === 'steam'} className={source === 'steam' ? 'active' : ''} onClick={() => setSource('steam')}><b>Steam</b><small>Your synced PC library</small></button>
      <button role="tab" aria-selected={source === 'retro'} className={source === 'retro' ? 'active' : ''} onClick={() => setSource('retro')}><b>RetroAchievements</b><small>RetroArch and classic games</small></button>
    </div>

    {source === 'steam' && <>
      {steamGames.length > 0 && <div className="achievement-game-toolbar"><label>Find a Steam game<input value={steamSearch} onChange={(event) => { const value = event.target.value; const match = steamGames.find((game) => game.title.toLocaleLowerCase().includes(value.toLocaleLowerCase())); setSteamSearch(value); setSteamGameId(match ? String(match.steam_app_id) : ''); if (!match) { setSteamData(null); setSteamLoading(false); setSteamError('') } }} placeholder="Search your synced games"/></label><label>Game<select value={steamGameId} onChange={(event) => setSteamGameId(event.target.value)}>{visibleSteamGames.map((game) => <option key={game.steam_app_id} value={game.steam_app_id}>{game.title}</option>)}</select></label></div>}
      {steamGames.length > 0 && !visibleSteamGames.length && <div className="achievement-message">No Steam game matches that search.</div>}
      {!steamGames.length && <div className="empty-state">No Steam games are linked yet. Sync your public Steam library from My Library to see achievement progress here.</div>}
      {steamLoading && <div className="catalog-state" role="status">Loading achievements for {steamGames.find((game) => String(game.steam_app_id) === steamGameId)?.title || 'your game'}…</div>}
      {steamError && <div className="achievement-message" role="alert"><b>Steam progress could not be loaded.</b><span>{steamError} Make sure your Steam game details are public and the game has Steam achievements.</span></div>}
    </>}

    {source === 'retro' && <>
      <form className="retro-account-form" onSubmit={connectRetroAccount}><label>RetroAchievements username<input value={retroUsername} onChange={(event) => setRetroUsername(event.target.value)} placeholder="Your RetroAchievements username" autoComplete="username"/></label><button className="button primary" type="submit">Connect account</button></form>
      <p className="achievement-config-hint">Get a web API key from the <a href="https://retroachievements.org/controlpanel.php" target="_blank" rel="noreferrer">RetroAchievements control panel</a>, add it as <code>RETROACHIEVEMENTS_API_KEY</code> in the server&apos;s local <code>.env</code> file, then restart the API. The key stays on the server.</p>
      {!activeRetroUsername && <div className="empty-state">Enter your RetroAchievements username to find your retro game progress.</div>}
      {activeRetroUsername && retroLoading && !retroGames.length && <div className="catalog-state" role="status">Loading RetroAchievements progress…</div>}
      {activeRetroUsername && retroError && <div className="achievement-message" role="alert"><b>RetroAchievements is not connected yet.</b><span>{retroError}</span></div>}
      {activeRetroUsername && retroGames.length > 0 && <div className="achievement-game-toolbar"><label>Find a retro game<input value={retroSearch} onChange={(event) => { const value = event.target.value; const match = retroGames.find((game) => `${game.title} ${game.consoleName}`.toLocaleLowerCase().includes(value.toLocaleLowerCase())); setRetroSearch(value); setRetroSelectedId(match ? String(match.gameId) : ''); if (!match) { setRetroData(null); setRetroLoading(false); setRetroError('') } }} placeholder="Search your RetroAchievements games"/></label><label>Game<select value={retroSelectedId} onChange={(event) => setRetroSelectedId(event.target.value)}>{visibleRetroGames.map((game) => <option key={game.gameId} value={game.gameId}>{game.title} · {game.consoleName} ({game.numAwarded}/{game.maxPossible})</option>)}</select></label></div>}
      {activeRetroUsername && retroGames.length > 0 && !visibleRetroGames.length && <div className="achievement-message">No retro game matches that search.</div>}
      {activeRetroUsername && !retroLoading && !retroError && retroGames.length === 0 && <div className="empty-state">No RetroAchievements game progress was found for this username yet.</div>}
      {retroGames.length > 0 && retroGames.length < retroTotal && <div className="achievement-load-more"><span>Showing {retroGames.length} of {retroTotal} games</span><button className="button" disabled={retroLoadingMore} onClick={loadMoreRetroGames}>{retroLoadingMore ? 'Loading…' : 'Load more games'}</button></div>}
    </>}

    {activeData && <>
      <div className="achievement-overview"><div className="achievement-game-identity">{source === 'retro' && (activeData.imageBoxArt || activeData.imageIcon) && <img src={activeData.imageBoxArt || activeData.imageIcon} alt=""/>}<span><small>{source === 'steam' ? 'STEAM GAME' : activeData.consoleName?.toUpperCase()}</small><b>{activeData.title || activeData.gameTitle || selectedRetroGame?.title || 'Achievement progress'}</b>{source === 'retro' && <em>{activeData.consoleName}</em>}</span></div><div className="achievement-progress"><strong>{completedCount}<small> / {totalCount}</small></strong><span>achievements unlocked</span><div className="achievement-progress-track"><i style={{ width: `${totalCount ? Math.min(100, completedCount / totalCount * 100) : 0}%` }}/></div></div><div className="achievement-overview-stat"><b>{Math.max(0, totalCount - completedCount)}</b><span>still locked</span></div></div>
      <div className="achievement-list-heading"><div><h2>{filter === 'completed' ? 'Achievements you completed' : filter === 'remaining' ? 'Still to unlock' : 'Achievement list'}</h2><span>{filteredAchievements.length} shown · completed achievements appear first</span></div><label>Search<input value={achievementSearch} onChange={(event) => setAchievementSearch(event.target.value)} placeholder="Find an achievement"/></label></div>
      <div className="achievement-filters">{[['all', `All (${totalCount})`], ['completed', `Completed (${completedCount})`], ['remaining', `Remaining (${Math.max(0, totalCount - completedCount)})`]].map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>
      {activeLoading && <div className="catalog-state" role="status">Loading achievement details…</div>}
      {!activeLoading && filteredAchievements.length > 0 && <div className="achievement-list">{filteredAchievements.map((achievement) => {
        const unlocked = Boolean(achievement.achieved)
        const hidden = source === 'steam' && achievement.hidden && !unlocked
        return <article className={`achievement-card ${unlocked ? 'unlocked' : 'locked'}`} key={achievement.id}>
          <span className="achievement-icon">{achievement.icon ? <img src={achievement.icon} alt="" loading="lazy"/> : <b>★</b>}</span>
          <span className="achievement-copy"><b>{hidden ? 'Hidden achievement' : achievement.title}</b><small>{hidden ? 'Unlock it in game to reveal the details.' : achievement.description || 'No description provided.'}</small></span>
          <span className="achievement-state">{unlocked ? <><b>✓ Unlocked</b><small>{achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString() : 'Completed'}</small>{source === 'retro' && achievement.hardcore && <em>HARDCORE</em>}</> : <b>Locked</b>}</span>
        </article>
      })}</div>}
      {!activeLoading && !activeError && totalCount === 0 && <div className="empty-state">This game has no achievement data available from {source === 'steam' ? 'Steam' : 'RetroAchievements'}.</div>}
      {!activeLoading && !activeError && totalCount > 0 && !filteredAchievements.length && <div className="empty-state">No achievements match this view.</div>}
    </>}
  </section>
}

function PageControls({ page, pageCount, total, onChange }) {
  if (total <= PAGE_SIZE) return null
  const start = (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)
  return <div className="pagination"><span>Showing {start}–{end} of {total}</span><div><button className="button" disabled={page === 1} onClick={() => onChange(page - 1)}>‹ Previous</button><strong>Page {page} / {pageCount}</strong><button className="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>Next ›</button></div></div>
}

function VaultCover({ game }) {
  return <GameCover title={game.title} cover={game.cover_image || game.cover_url} backdrop={game.backdrop_url}/>
}

function App() {
  const publicSteamId = window.location.pathname.match(/^\/u\/(\d{17})\/?$/)?.[1]
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [games, setGames] = useState([])
  const [logs, setLogs] = useState([])
  const [reviews, setReviews] = useState([])
  const [reviewFeedSort, setReviewFeedSort] = useState('recent')
  const [reviewGameFilter, setReviewGameFilter] = useState('all')
  const [steamReviewAppId, setSteamReviewAppId] = useState('')
  const [discoveryGames, setDiscoveryGames] = useState([])
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryMessage, setDiscoveryMessage] = useState('')
  const [discoverPlatform, setDiscoverPlatform] = useState('')
  const [discoverGenre, setDiscoverGenre] = useState('')
  const [discoverPage, setDiscoverPage] = useState(1)
  const [discoverHasMore, setDiscoverHasMore] = useState(false)
  const [discoverRefresh, setDiscoverRefresh] = useState(0)
  const [steamStoreCategory, setSteamStoreCategory] = useState('top_sellers')
  const [steamStoreGames, setSteamStoreGames] = useState([])
  const [steamStoreLoading, setSteamStoreLoading] = useState(false)
  const [steamStoreError, setSteamStoreError] = useState('')
  const [steamStoreRefresh, setSteamStoreRefresh] = useState(0)
  const [steamStoreActionId, setSteamStoreActionId] = useState(null)
  const [tab, setTab] = useState('Home')
  const [collectionView, setCollectionView] = useState('My Library')
  const [view, setView] = useState('grid')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [suggestions, setSuggestions] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogProviderError, setCatalogProviderError] = useState(false)
  const [catalogPlatformFilter, setCatalogPlatformFilter] = useState('All platforms')
  const [catalogGenreFilter, setCatalogGenreFilter] = useState('All genres')
  const [catalogBrowseCategory, setCatalogBrowseCategory] = useState('All Games')
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [selectedCatalogGame, setSelectedCatalogGame] = useState(null)
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
    const [gameResponse, activityResponse, reviewResponse] = await Promise.all([
      fetch('/api/games'), fetch('/api/activity?limit=100'), fetch('/api/reviews?limit=40'),
    ])
    if (gameResponse.ok) setGames(await gameResponse.json())
    if (activityResponse.ok) setLogs(await activityResponse.json())
    if (reviewResponse.ok) setReviews(await reviewResponse.json())
  }, [])

  const gogState = useGogAccount(user?.id, load)

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
    if (tab !== 'Discover') return
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(discoverPage) })
    if (discoverPlatform) params.set('platform', discoverPlatform)
    if (discoverGenre) params.set('genre', discoverGenre)
    fetch(`/api/catalog/discover?${params}`, { signal: controller.signal }).then(async (response) => {
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not load game suggestions.')
      setDiscoveryGames((current) => discoverPage > 1 ? [...current, ...(result.results || [])] : result.results || [])
      setDiscoveryMessage(result.message || '')
      setDiscoverHasMore(Boolean(result.hasMore))
    }).catch((error) => { if (error.name !== 'AbortError') setDiscoveryMessage(error.message) })
      .finally(() => { if (!controller.signal.aborted) setDiscoveryLoading(false) })
    return () => controller.abort()
  }, [tab, discoverPlatform, discoverGenre, discoverPage, discoverRefresh])

  useEffect(() => {
    if (tab !== 'Steam Store') return
    const controller = new AbortController()
    fetch(`/api/store/steam?category=${encodeURIComponent(steamStoreCategory)}`, { signal: controller.signal }).then(async (response) => {
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not load Steam store listings.')
      setSteamStoreGames(result.games || [])
    }).catch((error) => { if (error.name !== 'AbortError') setSteamStoreError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setSteamStoreLoading(false) })
    return () => controller.abort()
  }, [tab, steamStoreCategory, steamStoreRefresh])

  useEffect(() => {
    document.documentElement.dataset.theme = profile?.preferred_theme || 'vgui-olive'
    const theme = THEMES.find((item) => item.id === profile?.preferred_theme) || THEMES[0]
    THEME_VARIABLES.forEach((variable, index) => document.documentElement.style.setProperty(variable, theme.colors[index]))
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
    const matchesCategory = collectionView === 'Reviews' ? Boolean(game.rating || game.review_text?.trim())
      : collectionView === 'Wishlist' ? Boolean(game.is_favorite)
        : collectionView === 'New Releases' ? Number(game.year) >= new Date().getFullYear() - 1
          : true
    return matchesQuery && matchesCategory && (status === 'All statuses' || game.status === status)
  }).sort((a, b) => collectionView === 'Top' ? (b.rating || 0) - (a.rating || 0) : 0), [games, query, status, collectionView])
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageGames = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const platformSuggestions = [...new Set([...CONSOLE_PLATFORMS, ...games.map((game) => game.platform).filter(Boolean), ...(selectedCatalogGame?.platforms || [])])].sort((a, b) => a.localeCompare(b))
  const genreSuggestions = [...new Set([...games.flatMap((game) => game.genres || []), ...suggestions.flatMap((game) => game.genres || []), ...(selectedCatalogGame?.genres || [])])].sort((a, b) => a.localeCompare(b))
  const catalogPlatforms = [...new Set(suggestions.flatMap((game) => game.platforms || []))].sort((a, b) => a.localeCompare(b))
  const catalogGenres = [...new Set(suggestions.flatMap((game) => game.genres || []))].sort((a, b) => a.localeCompare(b))
  const visibleSuggestions = suggestions.filter((game) =>
    (catalogPlatformFilter === 'All platforms' || game.platforms?.includes(catalogPlatformFilter)) &&
    (catalogGenreFilter === 'All genres' || game.genres?.includes(catalogGenreFilter)))
  const reviewGameOptions = useMemo(() => {
    const gamesById = new Map()
    for (const review of reviews) if (review.game) gamesById.set(String(review.catalog_id), review.game.title)
    return [...gamesById].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title))
  }, [reviews])
  const visibleReviews = useMemo(() => reviews
    .filter((review) => reviewGameFilter === 'all' || String(review.catalog_id) === reviewGameFilter)
    .sort((a, b) => {
      if (reviewFeedSort === 'rating') return (b.rating || 0) - (a.rating || 0) || new Date(b.updated_at) - new Date(a.updated_at)
      return new Date(b.updated_at) - new Date(a.updated_at)
    }), [reviews, reviewFeedSort, reviewGameFilter])
  const steamReviewGames = useMemo(() => games.filter((game) => game.steam_app_id).sort((a, b) => a.title.localeCompare(b.title)), [games])
  const selectedSteamReviewGame = steamReviewGames.find((game) => String(game.steam_app_id) === steamReviewAppId) || steamReviewGames[0] || null

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
    setForm(DEFAULT_FORM); setSuggestions([]); setSelectedCatalogGame(null); setTab('Library'); setMessage(`${game.title} added to your vault.`)
  }
  const searchCatalog = async (title) => {
    setForm((current) => ({ ...current, title, catalog_id: undefined, genre: '', year: '', cover_image: '' }))
    setSelectedCatalogGame(null)
    setCatalogPlatformFilter('All platforms')
    setCatalogGenreFilter('All genres')
    catalogSearchController.current?.abort()
    if (title.trim().length < 2) { setSuggestions([]); setSuggestionIndex(0); setCatalogLoading(false); setCatalogProviderError(false); return }
    const controller = new AbortController()
    catalogSearchController.current = controller
    setCatalogLoading(true)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(title.trim())}`, { signal: controller.signal })
      const result = await readJsonResponse(response)
      setSuggestions(response.ok ? result.results || [] : [])
      setSuggestionIndex(0)
      setCatalogProviderError(Boolean(result.providerError))
    } catch (error) { if (error.name !== 'AbortError') setSuggestions([]) }
    finally { if (!controller.signal.aborted) setCatalogLoading(false) }
  }
  const selectCatalogGame = async (game) => {
    catalogSearchController.current?.abort()
    setCatalogLoading(true)
    try {
      if (game.gamedb_id) {
        const response = await fetch(`/api/catalog/gamedb/${game.gamedb_id}`, { method: 'POST' })
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || 'Could not load game metadata.')
        game = result
      } else if (game.rawg_id && String(game.id).startsWith('rawg:')) {
        const response = await fetch(`/api/catalog/rawg/${game.rawg_id}`, { method: 'POST' })
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || 'Could not load RAWG game metadata.')
        game = result
      }
    } catch (error) {
      setMessage(error.message)
      setCatalogLoading(false)
      return
    }
    setCatalogLoading(false)
    const availablePlatforms = game.platforms || []
    const currentPlatform = form.platform
    const preferredPlatform = availablePlatforms.find((platform) => platform.toLowerCase() === currentPlatform.toLowerCase()) || availablePlatforms[0] || currentPlatform
    setForm((current) => ({ ...current, catalog_id: game.id, title: game.title, platform: preferredPlatform, genre: game.genres?.join(', ') || '', year: game.release_year || '', cover_image: game.cover_url || '' }))
    setSelectedCatalogGame(game)
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
  const saveReview = async (game, rating, reviewText) => {
    const response = await fetch(`/api/games/${game.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, review_text: reviewText }) })
    if (!response.ok) return notifyError(response)
    const updated = await response.json()
    setGames((items) => items.map((item) => item.id === game.id ? updated : item))
    setSelectedGame(updated)
    setMessage('Your review has been saved.')
    const reviewResponse = await fetch('/api/reviews?limit=40')
    if (reviewResponse.ok) setReviews(await reviewResponse.json())
  }
  const removeGame = async (game) => {
    const response = await fetch(`/api/games/${game.id}`, { method: 'DELETE' })
    if (response.ok) setGames((items) => items.filter((item) => item.id !== game.id))
    else await notifyError(response)
  }
  const saveProfile = async (changes) => {
    const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    const result = await readJsonResponse(response)
    if (!response.ok) { setMessage(result.message || 'Could not save profile.'); throw new Error(result.message || 'Could not save profile.') }
    setProfile(result); setMessage('Profile settings saved.')
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
      const result = await readJsonResponse(response)
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
  const openCatalogDetails = async (game) => {
      setSelectedGame({ ...game, catalog_id: game.catalog_id || game.id, catalog_only: true }); setGameDetails(null); setDetailsError(''); setDetailsLoading(true)
    try {
      const response = await fetch(`/api/catalog/${game.id}/details`)
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not load game details.')
      setGameDetails(result)
    } catch (error) { setDetailsError(error.message) }
    finally { setDetailsLoading(false) }
  }
  const fetchSteamCatalogGame = async (game) => {
    const response = await fetch(`/api/store/steam/${game.steam_app_id}/catalog`, { method: 'POST' })
    const result = await readJsonResponse(response)
    if (!response.ok) throw new Error(result.message || 'Could not load Steam game details.')
    return result
  }
  const openSteamStoreGame = async (game) => {
    setSelectedGame({ ...game, catalog_only: true })
    setGameDetails(null)
    setDetailsError('')
    setDetailsLoading(true)
    try {
      const catalogGame = await fetchSteamCatalogGame(game)
      setSelectedGame({ ...catalogGame, catalog_id: catalogGame.id, platform: 'PC', catalog_only: true })
      setGameDetails(catalogGame)
    } catch (error) { setDetailsError(error.message) }
    finally { setDetailsLoading(false) }
  }
  const addSteamStoreGame = async (game) => {
    setSteamStoreActionId(game.steam_app_id)
    try {
      const catalogGame = await fetchSteamCatalogGame(game)
      const response = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catalog_id: catalogGame.id, title: catalogGame.title, platform: 'PC', status: 'Backlog', source: 'steam' }) })
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not add game to Backlog.')
      setGames((current) => current.some((item) => item.id === result.id) ? current : [result, ...current])
      setMessage(`${result.title} added to your Steam Backlog.`)
    } catch (error) { setMessage(error.message) }
    finally { setSteamStoreActionId(null) }
  }
  const addRecommendationToBacklog = async (game) => {
    const platform = game.platform || discoverPlatform || game.platforms?.[0] || 'PC'
    const response = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catalog_id: game.id, title: game.title, platform, status: 'Backlog' }) })
    if (!response.ok) return notifyError(response)
    const added = await response.json()
    setGames((current) => current.some((item) => item.id === added.id) ? current : [added, ...current])
    setDiscoveryGames((current) => current.filter((item) => item.id !== game.id))
    setSelectedGame(null)
    setMessage(`${added.title} added to your backlog on ${platform}.`)
  }
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setUser(null); setProfile(null); setGames([]); setLogs([]) }

  const steamDisplayName = !profile?.username || /^steam(?: user)?$/i.test(profile.username.trim()) ? `Steam ${user?.id || ''}` : profile.username
  const collectionTitle = collectionView === 'Reviews' ? 'Your Reviews'
    : collectionView === 'Wishlist' ? 'Wishlist'
      : collectionView === 'New Releases' ? 'Recent Releases in Your Vault'
        : collectionView === 'Top' ? 'Top Rated in Your Vault'
          : collectionView === 'Home' ? 'Home' : 'My Library'
  const chooseCategory = (category) => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setPage(1)
    setQuery('')
    setStatus('All statuses')
    if (category === 'Reviews') setTab('Reviews')
    else if (category === 'Achievements') setTab('Achievements')
    else if (category === 'Home') setTab('Home')
    else if (category === 'My Profile' || category === steamDisplayName) setTab('Profile')
    else if (category === 'Settings') setTab('Settings')
    else if (category === 'GOG Store') setTab('GOG Store')
    else if (['My Library', 'Wishlist'].includes(category)) {
      setTab('Library')
      setCollectionView(category)
    } else if (category === 'Recent releases') {
      setTab('Library')
      setCollectionView('New Releases')
    } else if (category === 'Top rated') {
      setTab('Library')
      setCollectionView('Top')
    } else if (category === 'Activity') setTab('Activity')
    else if (category === 'People you follow') setTab('Social')
    else if (category === 'Platforms') {
      setTab('Platforms')
      setCatalogBrowseCategory('Platforms')
      setDiscoverPlatform('')
      setDiscoverGenre('')
    } else if (category === 'Stores') {
      setTab('Stores')
      setCatalogBrowseCategory('Stores')
    } else if (category === 'Steam Store') {
      setTab('Steam Store')
      setCatalogBrowseCategory('Steam Store')
      setSteamStoreLoading(true)
      setSteamStoreError('')
      setSteamStoreRefresh((current) => current + 1)
    } else if (category === 'Backlog Picks' || ['All Games', 'Browse', 'Collections'].includes(category) || CONSOLE_PLATFORMS.includes(category) || DISCOVERY_GENRES.includes(category)) {
      setTab('Discover')
      setDiscoveryLoading(true)
      setCatalogBrowseCategory(category)
      setDiscoverPlatform(CONSOLE_PLATFORMS.includes(category) ? category : '')
      setDiscoverGenre(DISCOVERY_GENRES.includes(category) ? category : '')
      setDiscoverPage(1)
      setDiscoverRefresh((current) => current + 1)
    }
    else {
      setTab('Add Games')
      setCatalogBrowseCategory(category)
    }
  }

  if (publicSteamId) return <PublicProfile steamId={publicSteamId} message={message} />
  if (loading) return <main className="boot-screen">RETROVAULT // BOOTING…</main>
  if (!user) return <main className="login-screen"><section className="vgui-window login-window"><header className="titlebar"><b>RetroVault 2.0</b><span>Steam Library System</span></header><div className="login-content"><img className="login-logo" src="/retrovault-logo.png" alt="RetroVault — pixel-art vault" width="1254" height="1254" fetchPriority="high"/><h1>Your games. Your story.</h1><p>Sign in with Steam to sync your library, track playtime, and build your personal vault.</p><a className="button primary" href="/auth/steam">Sign in through Steam</a><small>Steam game details must be public for library sync.</small></div></section></main>

  return <main className="app-shell">
    <header className="vgui-window top-window"><div className="titlebar"><button className="brand-lockup brand-home" aria-label="RetroVault Home" onClick={() => chooseCategory('Home')}><img src="/retrovault-logo.png" alt="RetroVault" width="1254" height="1254" fetchPriority="high"/><span><strong>Home</strong><small>YOUR PERSONAL GAME VAULT</small></span></button><div className="account-chip">{profile?.avatar_url && <img src={profile.avatar_url} alt="" />}<button className="account-profile-button" onClick={() => chooseCategory('My Profile')}><b>{steamDisplayName}</b><small>{gogState.account?.connected ? `GOG · ${gogState.account.username}` : 'My profile'}</small></button><button className="button small" onClick={logout}>Log out</button></div></div>
    </header>

    {message && <div className="notice" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}

    <div className="app-workspace">
      <aside className="category-sidebar" aria-label="RetroVault sections">
        <button className="sidebar-profile" onClick={() => chooseCategory(steamDisplayName)}>{profile?.avatar_url && <img src={profile.avatar_url} alt=""/>}<span><b>{steamDisplayName}</b><small>{gogState.account?.connected ? `GOG · ${gogState.account.username}` : 'MY PLAYER PROFILE'}</small></span><i>›</i></button>
        <section className="sidebar-group"><h2>YOUR VAULT</h2>{['Home', 'Reviews', 'My Profile', 'Wishlist', 'My Library', 'People you follow'].map((name, index) => <button key={`vault-${name}`} className={`sidebar-link ${(name === 'Home' && tab === 'Home') || (['My Library', 'Wishlist'].includes(name) && tab === 'Library' && collectionView === name) || (name === 'Reviews' && tab === 'Reviews') || (name === 'My Profile' && tab === 'Profile') || (name === 'People you follow' && tab === 'Social') ? 'active' : ''}`} onClick={() => chooseCategory(name)}><span className="sidebar-icon" aria-hidden="true">{['⌂', '▤', '◉', '☆', '▦', '♧'][index]}</span>{name}</button>)}<button className={`sidebar-link ${tab === 'Achievements' ? 'active' : ''}`} onClick={() => chooseCategory('Achievements')}><span className="sidebar-icon" aria-hidden="true">★</span>Achievements</button></section>
        <section className="sidebar-group"><h2>NEW RELEASES</h2><button className={`sidebar-link ${tab === 'Library' && collectionView === 'New Releases' ? 'active' : ''}`} onClick={() => chooseCategory('Recent releases')}><span className="sidebar-icon" aria-hidden="true">◷</span>Recent releases</button></section>
        <section className="sidebar-group"><h2>TOP IN YOUR VAULT</h2><button className={`sidebar-link ${tab === 'Library' && collectionView === 'Top' ? 'active' : ''}`} onClick={() => chooseCategory('Top rated')}><span className="sidebar-icon" aria-hidden="true">▴</span>Top rated</button></section>
        <section className="sidebar-group"><h2>DISCOVER GAMES</h2>{['Backlog Picks', 'All Games', 'Browse', 'Platforms', 'Stores', 'Collections'].map((name) => <button key={name} className={`sidebar-link ${(name === 'Platforms' && tab === 'Platforms') || (name === 'Stores' && ['Stores', 'Steam Store', 'GOG Store'].includes(tab)) || (tab === 'Discover' && catalogBrowseCategory === name) ? 'active' : ''}`} onClick={() => chooseCategory(name)}><span className="sidebar-icon" aria-hidden="true">{name === 'Platforms' ? '▣' : name === 'Stores' ? '⌑' : name === 'Collections' ? '▤' : name === 'Backlog Picks' ? '✦' : '⌕'}</span>{name}</button>)}</section>
        <section className="sidebar-group"><h2>PLATFORMS</h2>{['PC', 'PlayStation 5', 'PlayStation 4', 'PlayStation 2', 'Xbox 360', 'Nintendo Switch', 'GameCube', 'Sega Dreamcast', 'Show all'].map((name) => <button key={`platform-${name}`} className={`sidebar-link ${tab === 'Discover' && discoverPlatform === name ? 'active' : ''}`} onClick={() => name === 'Show all' ? chooseCategory('Platforms') : chooseCategory(name)}><span className="sidebar-icon" aria-hidden="true">▣</span>{name}</button>)}</section>
        <section className="sidebar-group"><h2>GENRES</h2>{['Action', 'Adventure', 'RPG', 'Shooter', 'Strategy', 'Puzzle', 'Racing', 'Sports', 'Simulation', 'Horror', 'Indie', 'Show all'].map((name) => <button key={`genre-${name}`} className={`sidebar-link ${tab === 'Discover' && discoverGenre === name ? 'active' : ''}`} onClick={() => name === 'Show all' ? chooseCategory('Genres') : chooseCategory(name)}><span className="sidebar-icon" aria-hidden="true">◆</span>{name}</button>)}</section>
        <button className={`sidebar-link ${tab === 'Activity' ? 'active' : ''}`} onClick={() => chooseCategory('Activity')}><span className="sidebar-icon" aria-hidden="true">◴</span>Activity</button>
      </aside>
      <div className="workspace-main">

    {tab === 'Home' && <HomePage profile={profile} games={games} stats={stats} navigate={chooseCategory} openGame={openDetails} Cover={VaultCover} gog={gogState.account}/>}
    {tab === 'Profile' && <ProfilePage profile={profile} games={games} stats={stats} logs={logs} saveProfile={saveProfile} navigate={chooseCategory} openGame={openDetails} gogState={gogState} Cover={VaultCover}/>}
    {tab === 'GOG Store' && <GogStore games={games} navigate={chooseCategory} Cover={VaultCover} onAdd={addRecommendationToBacklog} onOpen={(game) => { setSelectedGame({ ...game, catalog_id: game.id, platform: 'GOG', catalog_only: true }); setGameDetails(game); setDetailsError(''); setDetailsLoading(false) }}/>}
    {tab === 'Settings' && <ThemePicker profile={profile} onSave={saveProfile}/>}

    {tab === 'Library' && <>
      <section className="stats-grid">{[['IN VAULT', stats.total], ['COMPLETED', `${stats.completed} (${stats.completion}%)`], ['BACKLOG', stats.backlog], ['RECORDED PLAYTIME', prettyTime(stats.playtime)]].map(([label, value]) => <div className="vgui-window stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section>
      <section className="library-layout library-only">
        <div className="vgui-window library-window"><div className="section-heading"><div><small>{collectionView === 'New Releases' || collectionView === 'Top' ? 'PERSONAL COLLECTION · FILTERED VIEW' : 'PERSONAL COLLECTION'}</small><h1>{collectionTitle} <span>{visible.length}</span></h1></div><div className="heading-actions"><button className="button" onClick={spinBacklog}>Backlog roulette</button><button className="button primary" disabled={syncing} onClick={sync}>{syncing ? 'Syncing…' : '↻ Sync Steam'}</button></div></div>
          <div className="toolbar"><input aria-label="Search library" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search title, platform, genre…"/><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option>All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select><button className={`button ${view === 'grid' ? 'selected' : ''}`} onClick={() => setView('grid')} title="Poster grid">▦</button><button className={`button ${view === 'list' ? 'selected' : ''}`} onClick={() => setView('list')} title="Compact list">☷</button></div>
          {roulette && <div className="roulette-result">{roulette.artwork_hero_url && <img className="roulette-backdrop" src={roulette.artwork_hero_url} alt=""/>}<div className="roulette-poster"><GameCover title={roulette.title} cover={roulette.cover_image} backdrop={roulette.backdrop_url}/></div><div className="roulette-copy"><small>BACKLOG ROULETTE // TONIGHT&apos;S PICK</small><b>{roulette.title}</b><span>{roulette.platform} · {roulette.year || 'Release year unknown'} · {prettyTime(roulette.playtime_minutes)}</span>{roulette.summary && <p>{roulette.summary.slice(0, 180)}{roulette.summary.length > 180 ? '…' : ''}</p>}<div><button className="button" onClick={() => openDetails(roulette)}>Game details</button>{roulette.steam_app_id && <a className="button primary" href={`steam://run/${roulette.steam_app_id}`}>Launch in Steam ↗</a>}</div></div><button className="roulette-close" onClick={() => setRoulette(null)} aria-label="Close roulette preview">×</button></div>}
          <PageControls page={currentPage} pageCount={pageCount} total={visible.length} onChange={setPage}/>
          {pageGames.length ? <div className={view === 'grid' ? 'game-grid' : 'game-list'}>{pageGames.map((game) => <article className="game-card" key={game.id}>
            <div className="poster"><button type="button" className="poster-trigger" aria-label={`View details for ${game.title}`} onClick={() => openDetails(game)}><GameCover title={game.title} cover={game.cover_image} backdrop={game.backdrop_url}/><span className="poster-view">Details</span></button><button className={`favorite ${game.is_favorite ? 'on' : ''}`} onClick={() => editGame(game, { is_favorite: !game.is_favorite })} title="Toggle favorite">★</button></div>
            <div className="game-info"><button type="button" className="game-title detail-title" onClick={() => openDetails(game)}><b title={game.title}>{game.title}</b><span>{game.year || '—'} · {game.platform}</span></button><select aria-label={`Status for ${game.title}`} value={game.status} onChange={(event) => changeStatus(game, event.target.value)}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select><div className="game-meta"><span>{game.genres?.join(', ') || game.genre || 'Unclassified'}</span><span>{game.playtime_available === false ? 'Playtime unavailable' : prettyTime(game.playtime_minutes)}</span></div><div className="game-actions"><label>★ <input aria-label={`Rating for ${game.title}`} type="number" min="1" max="10" defaultValue={game.rating || ''} placeholder="Rate" onBlur={(event) => { if (event.target.value) editGame(game, { rating: Number(event.target.value) }) }}/></label><button onClick={() => openDetails(game)}>Review</button><button onClick={() => { const notes = window.prompt('Vault notes', game.notes || ''); if (notes !== null) editGame(game, { notes }) }}>Notes</button><button onClick={() => { const price = window.prompt('Purchase price (number)', game.purchase_price ?? ''); if (price !== null && price !== '') editGame(game, { purchase_price: Number(price) }) }}>Price</button>{game.steam_app_id && <a href={`steam://run/${game.steam_app_id}`}>Play ↗</a>}<button className="delete-action" onClick={() => removeGame(game)} title="Remove from vault">Remove</button></div></div>
          </article>)}</div> : <div className="empty-state">{games.length ? 'No games match those filters.' : 'Your vault is empty. Sync Steam or add your first game.'}</div>}
          <PageControls page={currentPage} pageCount={pageCount} total={visible.length} onChange={setPage}/>
        </div>
      </section>
    </>}

    {tab === 'Achievements' && <AchievementsPage games={games}/>}

    {tab === 'Platforms' && <section className="vgui-window content-window directory-window"><div className="section-heading"><div><small>HARDWARE LIBRARY // ALL ERAS</small><h1>Choose a platform</h1><p>Browse games by the console or system they were made for. Select a platform to see its catalog.</p></div><span>{CONSOLE_PLATFORMS.length} platforms</span></div>
      <div className="platform-groups">{PLATFORM_GROUPS.map((group) => <section className="platform-group" key={group.name}><div className="directory-section-heading"><small>{group.name.toUpperCase()}</small><span>{group.platforms.length} systems</span></div><div className="platform-tile-grid">{group.platforms.map((platform, index) => <button className="platform-tile" key={platform} onClick={() => chooseCategory(platform)}><span className="platform-mark">{group.name === 'PlayStation' ? 'PS' : group.name === 'Nintendo' ? 'N' : group.name === 'Xbox' ? 'X' : group.name === 'Sega' ? 'S' : group.name === 'PC & Handheld' ? 'PC' : 'AR'}</span><span><b>{platform}</b><small>Browse games <i>›</i></small></span><em>{String(index + 1).padStart(2, '0')}</em></button>)}</div></section>)}</div>
      <div className="directory-footer"><span>Want a wider catalog? Search any title, including arcade and regional releases.</span><button className="button primary" onClick={() => { setTab('Add Games'); setCatalogBrowseCategory('All Games') }}>Search games</button></div>
    </section>}

    {tab === 'Stores' && <section className="vgui-window content-window directory-window"><div className="section-heading"><div><small>STORE DIRECTORY // GAME SOURCES</small><h1>Game stores</h1><p>Choose a storefront. Steam and GOG have live shelves, prices, and offers inside RetroVault. Other entries open their official storefronts.</p></div><span>{GAME_STORES.length} stores</span></div>
      <div className="store-directory-grid">{GAME_STORES.map((store) => <article className={`store-directory-card ${store.internal ? 'store-integrated' : ''}`} key={store.name}><div className="store-mark">{store.mark}</div><div className="store-directory-copy"><small>{store.internal ? 'IN RETROVAULT' : 'OFFICIAL STOREFRONT'}</small><h2>{store.name}</h2><p>{store.description}</p></div>{store.internal ? <button className="button primary" onClick={() => chooseCategory(store.name === 'Steam' ? 'Steam Store' : 'GOG Store')}>Browse {store.name} <span>›</span></button> : <a className="button" href={store.url} target="_blank" rel="noreferrer">Open store ↗</a>}</article>)}</div>
    </section>}

    {tab === 'Steam Store' && <section className="vgui-window content-window steam-store-window"><div className="steam-store-hero"><div><small>STEAM STORE // ROMANIA</small><h1>Find your next game.</h1><p>Fresh releases, current bestsellers, games people are playing, and live Steam deals.</p></div><button className="button" onClick={() => { setSteamStoreLoading(true); setSteamStoreError(''); setSteamStoreRefresh((current) => current + 1) }}>↻ Refresh</button></div>
      <div className="steam-store-toolbar"><div className="steam-store-tabs">{STEAM_STORE_CATEGORIES.map(([key, label]) => <button key={key} className={`steam-store-tab ${steamStoreCategory === key ? 'active' : ''}`} onClick={() => { setSteamStoreLoading(true); setSteamStoreError(''); setSteamStoreCategory(key); setSteamStoreRefresh((current) => current + 1) }}>{label}</button>)}</div><a href="https://store.steampowered.com/" target="_blank" rel="noreferrer">Open Steam Store ↗</a></div>
      <div className="steam-store-caption"><span>{steamStoreCategory === 'top_sellers' ? 'Ranked by current sales revenue' : steamStoreCategory === 'most_played' ? 'Ranked by current player count' : steamStoreCategory === 'new_releases' ? 'Recently released games on Steam' : 'Current Steam discounts'}</span><small>Romania · original store currency · cached up to 10 minutes</small></div>
      {steamStoreLoading && <div className="catalog-state" role="status">Loading the live Steam shelf…</div>}
      {steamStoreError && <div className="catalog-state" role="alert">{steamStoreError}</div>}
      {!steamStoreLoading && !steamStoreError && steamStoreGames.length > 0 && <div className="steam-store-grid">{steamStoreGames.map((game) => <article className="steam-product-card" key={`${steamStoreCategory}-${game.steam_app_id}`}>
        <button className="steam-product-image" onClick={() => openSteamStoreGame(game)} aria-label={`View ${game.title} details`}><img src={game.cover_url || game.header_image} alt="" loading="lazy"/>{game.discount_percent > 0 && <b className="steam-discount">−{game.discount_percent}%</b>}{game.rank && <span className="steam-rank">#{game.rank}</span>}</button>
        <div className="steam-product-info"><button className="steam-product-title" onClick={() => openSteamStoreGame(game)}>{game.title}</button>
          {steamStoreCategory === 'most_played' && <small className="steam-popularity">Peak today: {Number(game.peak_today || 0).toLocaleString()}</small>}
          <StorePrice game={game}/>
          <div className="steam-product-actions"><button className="button small" disabled={steamStoreActionId === game.steam_app_id} onClick={() => addSteamStoreGame(game)}>{steamStoreActionId === game.steam_app_id ? 'Adding…' : '＋ Backlog'}</button><a className="button small" href={game.steam_url} target="_blank" rel="noreferrer">Steam ↗</a></div>
        </div>
      </article>)}</div>}
      {!steamStoreLoading && !steamStoreError && !steamStoreGames.length && <div className="empty-state">Steam has no games in this shelf right now.</div>}
      <p className="catalog-attribution">Live listings and prices are from Steam. Top sellers use Steam’s sales chart; Most Played uses its player chart. <a href="https://store.steampowered.com/charts/topselling" target="_blank" rel="noreferrer">View Steam charts ↗</a></p>
    </section>}

    {tab === 'Discover' && <section className="vgui-window content-window discovery-window"><div className="section-heading"><div><small>THE RETROVAULT GAME SHELF</small><h1>{discoverPlatform || discoverGenre ? `${discoverPlatform || discoverGenre} games` : catalogBrowseCategory === 'Backlog Picks' ? 'Backlog Picks' : 'Discover games'}</h1><p>Explore beyond Steam. Pick a platform or genre in the sidebar and add anything straight to your backlog.</p></div><button className="button" onClick={() => { setDiscoveryLoading(true); setDiscoverRefresh((current) => current + 1) }}>↻ Refresh</button></div>
      <div className="discovery-toolbar"><span>{discoveryGames.length} suggestions {discoverPlatform ? `for ${discoverPlatform}` : ''} {discoverGenre ? `· ${discoverGenre}` : ''}</span><button className="button primary" onClick={() => chooseCategory('All Games')}>Browse all games</button><button className="button" onClick={() => { setTab('Add Games'); setCatalogBrowseCategory('All Games') }}>Search a title</button></div>
      {discoveryMessage && <div className="catalog-state" role="status">{discoveryMessage}</div>}
      {discoveryLoading && <div className="catalog-state" role="status">Finding games that match…</div>}
      {!discoveryLoading && discoveryGames.length > 0 && <div className="game-grid discovery-grid">{discoveryGames.map((game) => <article className="game-card discovery-card" key={game.id}><button className="discovery-cover" onClick={() => openCatalogDetails(game)} aria-label={`View details for ${game.title}`}><GameCover title={game.title} cover={game.artwork_grid_url || game.cover_url} backdrop={game.artwork_hero_url || game.backdrop_url}/><span className="poster-view">Details</span></button><div className="game-info"><button className="game-title detail-title" onClick={() => openCatalogDetails(game)}><b title={game.title}>{game.title}</b><span>{game.release_year || 'Year unknown'}{game.platforms?.length ? ` · ${game.platforms.slice(0, 2).join(', ')}` : ''}</span></button><div className="game-meta"><span>{game.genres?.slice(0, 2).join(', ') || 'Cross-platform'}</span><span>{game.rating_count ? `${(Number(game.rating_avg || 0) / 2).toFixed(1)} / 5` : 'New pick'}</span></div>{game.metacritic_score && <small className="discover-meta-score">Metacritic {game.metacritic_score}</small>}<button className="button primary discovery-add" onClick={() => addRecommendationToBacklog(game)}>＋ Add to backlog</button></div></article>)}</div>}
      {!discoveryLoading && discoveryGames.length === 0 && <div className="empty-state">No suggestions are available for this filter yet. Try another platform or genre.</div>}
      {discoverHasMore && <div className="discovery-more"><button className="button" disabled={discoveryLoading} onClick={() => { setDiscoveryLoading(true); setDiscoverPage((current) => current + 1) }}>More games</button></div>}
      <p className="catalog-attribution">Game metadata and discovery from <a href="https://github.com/LizardByte/GameDB" target="_blank" rel="noreferrer">LizardByte GameDB</a> (IGDB based), combined with your shared RetroVault catalog. Community art by <a href="https://www.steamgriddb.com/" target="_blank" rel="noreferrer">SteamGridDB</a>.</p>
    </section>}

    {tab === 'Reviews' && <section className="vgui-window content-window reviews-window"><div className="section-heading"><div><small>COMMUNITY NOTES // PUBLIC PROFILES</small><h1>Reviews</h1><p>Read English Steam community reviews and public RetroVault player reviews.</p></div><span>{reviews.length} RetroVault reviews</span></div>
      <div className="review-write-shortcut"><b>Your games</b><span>Choose a game to write or update your review.</span></div>
      {games.length > 0 && <div className="review-owned-games">{games.slice(0, 12).map((game) => <button className="review-game-chip" key={game.id} onClick={() => openDetails(game)}><GameCover title={game.title} cover={game.cover_image} backdrop={game.backdrop_url}/><span><b>{game.title}</b><small>{game.rating ? `${game.rating}/10` : 'Not rated'} · {game.review_text?.trim() ? 'Edit review' : 'Write review'}</small></span>›</button>)}</div>}
      {selectedSteamReviewGame ? <><div className="steam-review-game-select"><label>Steam game<select value={selectedSteamReviewGame.steam_app_id} onChange={(event) => setSteamReviewAppId(event.target.value)}>{steamReviewGames.map((game) => <option key={game.steam_app_id} value={game.steam_app_id}>{game.title}</option>)}</select></label></div><SteamReviewsPanel key={selectedSteamReviewGame.steam_app_id} steamAppId={selectedSteamReviewGame.steam_app_id} gameTitle={selectedSteamReviewGame.title}/></> : <div className="empty-state">Sync a Steam game into your library to browse its English community reviews. You can still write RetroVault reviews for any game.</div>}
      <div className="review-feed-heading"><h2>RetroVault player reviews</h2><div className="review-feed-controls"><label>Game<select value={reviewGameFilter} onChange={(event) => setReviewGameFilter(event.target.value)}><option value="all">All games</option>{reviewGameOptions.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}</select></label><label>Sort<select value={reviewFeedSort} onChange={(event) => setReviewFeedSort(event.target.value)}><option value="recent">Newest</option><option value="rating">Highest rated</option></select></label><button className="button small" onClick={async () => { const response = await fetch('/api/reviews?limit=40'); if (response.ok) setReviews(await response.json()) }}>Refresh</button></div></div>
      {visibleReviews.length ? <div className="review-feed">{visibleReviews.map((review) => <article className="review-card" key={review.id}><div className="review-game-cover"><GameCover title={review.game.title} cover={review.game.artwork_grid_url || review.game.cover_url} backdrop={review.game.artwork_hero_url || review.game.backdrop_url}/></div><div className="review-content"><div className="review-card-heading"><div><b>{review.game.title}</b><small>{review.author.username} · {new Date(review.updated_at).toLocaleDateString()}</small></div><strong>{review.rating ? `${review.rating}/10` : '—'}</strong></div><p>{review.review_text}</p><button className="button small" onClick={() => { const ownedGame = games.find((game) => game.catalog_id === review.catalog_id); ownedGame ? openDetails(ownedGame) : openCatalogDetails({ ...review.game, id: review.catalog_id }) }}>{review.is_mine ? 'Edit your review' : 'Game details'}</button></div></article>)}</div> : <div className="empty-state">No reviews match this filter. Open one of your games and be the first to share a review.</div>}
    </section>}

    {tab === 'Add Games' && <section className="vgui-window content-window add-games-window"><div className="add-games-heading"><div><small>CROSS-PLATFORM CATALOG // {catalogBrowseCategory.toUpperCase()}</small><h1>Add games from any era</h1><p>Search PC, PlayStation, Nintendo, Sega, handheld, and arcade releases. Pick a result to fill in its details, then choose the edition you own.</p></div><span className="catalog-count">{stats.total} IN YOUR VAULT</span></div>
      <div className="catalog-layout"><div className="catalog-search-panel"><label htmlFor="catalog-title">Search the game catalog</label><input id="catalog-title" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={visibleSuggestions.length > 0} aria-controls="catalog-suggestions" aria-activedescendant={visibleSuggestions[suggestionIndex] ? `catalog-option-${visibleSuggestions[suggestionIndex].id}` : undefined} value={form.title} onChange={(event) => searchCatalog(event.target.value)} onKeyDown={(event) => { if (event.key === 'ArrowDown' && visibleSuggestions.length) { event.preventDefault(); setSuggestionIndex((index) => (index + 1) % visibleSuggestions.length) } else if (event.key === 'ArrowUp' && visibleSuggestions.length) { event.preventDefault(); setSuggestionIndex((index) => (index - 1 + visibleSuggestions.length) % visibleSuggestions.length) } else if (event.key === 'Enter' && visibleSuggestions[suggestionIndex]) { event.preventDefault(); selectCatalogGame(visibleSuggestions[suggestionIndex]) } else if (event.key === 'Escape') { setSuggestions([]) } }} placeholder="Try Dead Space or Burnout Dominator…"/>
        <div className="catalog-source-note">Search RAWG&apos;s game database alongside GameDB and your RetroVault catalog. Selecting a RAWG or GameDB result loads its artwork, platforms, release details and ratings. Metadata supplied by <a href="https://rawg.io/" target="_blank" rel="noreferrer">RAWG</a>.{catalogProviderError && <span className="catalog-error"> A remote catalog could not be reached; showing the available results.</span>}</div>
        {suggestions.length > 0 && <div className="catalog-browse-filters"><label>Browse platforms<select value={catalogPlatformFilter} onChange={(event) => { setCatalogPlatformFilter(event.target.value); setSuggestionIndex(0) }}><option>All platforms</option>{catalogPlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label><label>Genres<select value={catalogGenreFilter} onChange={(event) => { setCatalogGenreFilter(event.target.value); setSuggestionIndex(0) }}><option>All genres</option>{catalogGenres.map((genre) => <option key={genre}>{genre}</option>)}</select></label></div>}
        {catalogLoading && <div className="catalog-state" role="status">Searching across platforms…</div>}
        {!catalogLoading && form.title.trim().length >= 2 && suggestions.length === 0 && <div className="catalog-state">No matches found. You can still add it manually below.</div>}
        {visibleSuggestions.length > 0 && <><div className="catalog-match-count">{visibleSuggestions.length} matches · use ↑ ↓ and Enter to select</div><div className="catalog-results" id="catalog-suggestions" role="listbox" aria-label="Game suggestions">{visibleSuggestions.map((game, index) => <button type="button" role="option" id={`catalog-option-${game.id}`} aria-selected={suggestionIndex === index} className={`catalog-result ${suggestionIndex === index ? 'active' : ''}`} key={game.id} onMouseEnter={() => setSuggestionIndex(index)} onClick={() => selectCatalogGame(game)}><span className="catalog-result-cover">{game.cover_url ? <img src={game.cover_url} alt="" loading="lazy"/> : game.title.slice(0, 1)}</span><span className="catalog-result-info"><b>{game.title}</b><small>{game.release_year || (game.rawg_id ? 'RAWG' : game.gamedb_id ? 'GameDB · IGDB' : 'Year unknown')}{game.genres?.length ? ` · ${game.genres.slice(0, 2).join(', ')}` : ''}</small><span>{game.platforms?.length ? game.platforms.slice(0, 5).join(' · ') : game.rawg_id || game.gamedb_id ? 'Select to load platforms and artwork' : 'Platform details unavailable'}{game.rawg_rating ? ` · RAWG ${Number(game.rawg_rating).toFixed(1)}/5` : ''}</span></span><span className="catalog-result-action">Select ›</span></button>)}</div></>}
        {suggestions.length > 0 && visibleSuggestions.length === 0 && <div className="catalog-state">No matches for these platform and genre filters.</div>}
      </div>
      <form onSubmit={addGame} className="add-form catalog-form"><div className="panel-title"><small>{form.catalog_id ? 'CATALOG MATCH SELECTED' : 'MANUAL OR CATALOG ENTRY'}</small><h2>{selectedCatalogGame?.title || 'Game details'}</h2></div>
        {selectedCatalogGame && <div className="selected-game-preview">{selectedCatalogGame.cover_url && <img src={selectedCatalogGame.cover_url} alt=""/>}<span><b>{selectedCatalogGame.title}</b><small>{selectedCatalogGame.release_year || 'Release year unknown'} · {selectedCatalogGame.platforms?.length || 0} platforms listed</small></span></div>}
        <label>Title<input required value={form.title} onChange={(event) => searchCatalog(event.target.value)} placeholder="Enter a game title"/></label>
        <label>Platform you own<input required list="retro-platform-options" autoComplete="off" aria-describedby="platform-hint" value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))} placeholder="Type to find your console or platform"/><datalist id="retro-platform-options">{platformSuggestions.map((platform) => <option key={platform} value={platform}/>)}</datalist><small className="form-hint" id="platform-hint">Start typing for PC, PlayStation, Xbox, Nintendo, Sega and handheld suggestions.</small></label>
        <label>Genres<input list="retro-genre-options" autoComplete="off" value={form.genre} onChange={(event) => setForm((current) => ({ ...current, genre: event.target.value }))} placeholder="Start typing: action, racing…"/><datalist id="retro-genre-options">{genreSuggestions.map((genre) => <option key={genre} value={genre}/>)}</datalist><small className="form-hint">Suggestions come from the selected game and games already in your vault. You can enter more than one genre.</small></label>
        <div className="form-row"><label>Release year<input type="number" min="1950" max="2200" value={form.year} onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))} placeholder="Optional"/></label><label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label></div>
        <label>Cover image URL<input type="url" value={form.cover_image} onChange={(event) => setForm((current) => ({ ...current, cover_image: event.target.value }))} placeholder="Filled when available"/></label>
        <label>Notes<textarea rows="3" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}/></label>
        <button className="button primary" type="submit">Add to my vault</button>
      </form></div>
      <p className="catalog-attribution">Game metadata comes from <a href="https://rawg.io/" target="_blank" rel="noreferrer">RAWG</a>, <a href="https://github.com/LizardByte/GameDB" target="_blank" rel="noreferrer">LizardByte GameDB</a> and <a href="https://www.igdb.com/" target="_blank" rel="noreferrer">IGDB</a>. Missing releases can still be added manually.</p>
    </section>}

    {tab === 'Activity' && <section className="vgui-window content-window"><div className="section-heading"><div><small>SYNCED DELTAS</small><h1>Playtime Activity</h1></div><span>{logs.length} events</span></div>{logs.length ? <div className="activity-list">{logs.map((log) => <article key={log.id}><span className="activity-dot"/><img src={log.catalog?.cover_url || ''} alt=""/><div><b>{log.catalog?.title || 'Unknown game'}</b><small>{new Date(log.happened_at).toLocaleString()} · {log.source}</small></div><strong>+{prettyTime(log.delta_minutes)}</strong></article>)}</div> : <div className="empty-state">Your activity appears after Steam reports new playtime during a sync.</div>}</section>}

    {tab === 'Social' && <section className="social-grid"><article className="vgui-window content-window"><small>PUBLIC PROFILE</small><h1>Share your vault</h1><p>Choose whether your collection can appear on your public RetroVault profile.</p><label className="switch-row"><span>{profile?.is_public ? 'Profile is public' : 'Profile is private'}</span><input type="checkbox" checked={Boolean(profile?.is_public)} onChange={(event) => saveProfile({ is_public: event.target.checked }).catch(() => {})}/></label>{profile?.is_public && <><a className="button" target="_blank" rel="noreferrer" href={`/u/${user.id}`}>Open public profile</a><div className="snippet"><small>MARKDOWN BADGE</small><code>[![RetroVault]({window.location.origin}/api/badge/{user.id}.svg)]({window.location.origin}/u/{user.id})</code><button className="button small" onClick={() => navigator.clipboard?.writeText(`[![RetroVault](${window.location.origin}/api/badge/${user.id}.svg)](${window.location.origin}/u/${user.id})`)}>Copy snippet</button></div></>}</article>
      <article className="vgui-window content-window"><small>CO-OP COMPATIBILITY</small><h1>LAN Party Matcher</h1><p>Find shared co-op or multiplayer titles between your public profile and a friend’s Steam ID.</p><form className="inline-form" onSubmit={findMatches}><input inputMode="numeric" pattern="[0-9]{17}" required value={friendId} onChange={(event) => setFriendId(event.target.value)} placeholder="17-digit Steam ID"/><button className="button primary">Find games</button></form>{matches.map((game) => <div className="match-row" key={game.id}>{game.cover_url && <img src={game.cover_url} alt=""/>}<b>{game.title}</b><span>{game.co_op ? 'Co-op' : 'Multiplayer'}</span></div>)}</article></section>}

    {tab === 'Settings' && <section className="vgui-window content-window settings-window"><small>CLIENT CONFIGURATION</small><h1>Interface Settings</h1><label className="setting-row"><span><b>VGUI skin</b><small>Saved to your RetroVault profile and applied throughout the site.</small></span><select value={profile?.preferred_theme || 'vgui-olive'} onChange={(event) => saveProfile({ preferred_theme: event.target.value, custom_theme: {} }).catch(() => {})}>{THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label><div className="theme-builder"><h2>Custom skin colors</h2><p>Optional overrides for background, panels, accent, and text. Defaults return when a field is cleared.</p><div className="color-grid">{[['background', 'Background'], ['panel', 'Panel'], ['accent', 'Accent'], ['text', 'Text']].map(([key, label]) => <label key={key}>{label}<input type="color" value={profile?.custom_theme?.[key] || ({ background: '#171914', panel: '#252820', accent: '#a9d4ff', text: '#e5e5dc' })[key]} onChange={(event) => setProfile((current) => ({ ...current, custom_theme: { ...current?.custom_theme, [key]: event.target.value } }))}/></label>)}</div><button className="button primary" onClick={() => saveProfile({ custom_theme: profile.custom_theme || {} }).catch(() => {})}>Save custom colors</button></div><div className="setting-row"><span><b>Steam account</b><small>{profile?.profile_url || user.id}</small></span><span>{steamDisplayName}</span></div></section>}

    {selectedGame && <GameDetailsDialog key={`${selectedGame.catalog_only ? 'catalog' : 'user'}-${selectedGame.id}`} game={selectedGame} details={gameDetails} reviews={reviews.filter((review) => review.catalog_id === selectedGame.catalog_id)} loading={detailsLoading} error={detailsError} onClose={() => setSelectedGame(null)} onSaveReview={saveReview} onAddToBacklog={addRecommendationToBacklog}/>}
      </div>
    </div>
    <footer className="statusbar"><span className={supabaseOnline ? '' : 'offline'}><i/> SUPABASE {supabaseOnline ? 'ONLINE' : 'OFFLINE'}</span><span>{games.length} TITLES · {prettyTime(stats.playtime)} TRACKED</span><span>GAME DATA: RAWG + GAMEDB + STEAM + GOG</span><span>STEAM ID {user.id}</span></footer>
  </main>
}

export default App

function SteamReviewsPanel({ steamAppId, gameTitle }) {
  const [sort, setSort] = useState('helpful')
  const [sentiment, setSentiment] = useState('all')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ sort, sentiment })
    fetch(`/api/steam/reviews/${steamAppId}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || 'Steam reviews are unavailable right now.')
        setData(result)
      })
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [steamAppId, sort, sentiment, refresh])

  const reviews = data?.reviews || []
  const reviewsUrl = `https://store.steampowered.com/app/${steamAppId}/`
  return <section className="steam-reviews-panel">
    <div className="review-feed-heading steam-review-heading"><div><h2>Steam community reviews</h2><small>English · {Number(data?.total_reviews || 0).toLocaleString()} matching reviews</small></div><a href={reviewsUrl} target="_blank" rel="noreferrer">{gameTitle} on Steam ↗</a></div>
    <div className="steam-review-toolbar">
      <label>Order<select value={sort} onChange={(event) => { setLoading(true); setError(''); setSort(event.target.value) }}><option value="helpful">Most helpful</option><option value="recent">Newest</option><option value="updated">Recently updated</option></select></label>
      <label>Sentiment<select value={sentiment} onChange={(event) => { setLoading(true); setError(''); setSentiment(event.target.value) }}><option value="all">All reviews</option><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
      <button className="button small" disabled={loading} onClick={() => { setLoading(true); setError(''); setRefresh((current) => current + 1) }}>Refresh</button>
      <span>Sorted by Steam helpfulness votes</span>
    </div>
    {loading && <div className="steam-review-state" role="status">Loading English Steam reviews…</div>}
    {error && <div className="steam-review-state review-error" role="alert">{error}</div>}
    {!loading && !error && reviews.length > 0 && <div className="steam-review-list">{reviews.map((review) => <article className="steam-review-card" key={review.review_id}>
      <div className="steam-review-meta"><strong className={review.recommended ? 'positive' : 'negative'}>{review.recommended ? 'Recommended' : 'Not recommended'}</strong><span>{review.author}{review.created_at ? ` · ${new Date(review.created_at).toLocaleDateString()}` : ''}</span><span>{prettyTime(review.playtime_minutes)} played</span><span>{Number(review.helpful).toLocaleString()} found helpful</span></div>
      <p>{review.text}</p>
    </article>)}</div>}
    {!loading && !error && reviews.length === 0 && <div className="steam-review-state">No English reviews found for this filter.</div>}
  </section>
}

function GameDetailsDialog({ game, details, reviews = [], loading, error, onClose, onSaveReview, onAddToBacklog }) {
  const data = details || game
  const screenshots = data.screenshots || []
  const steamUrl = data.steam_app_id ? `https://store.steampowered.com/app/${data.steam_app_id}/` : null
  const gridUrl = `https://www.steamgriddb.com/search/grids?term=${encodeURIComponent(data.title)}`
  const [reviewRating, setReviewRating] = useState(game.rating || '')
  const [reviewText, setReviewText] = useState(game.review_text || '')
  const [savingReview, setSavingReview] = useState(false)
  return <div className="details-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="vgui-window details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-title">
      <header className="details-header"><div><small>GAME DOSSIER // {data.steam_app_id ? `STEAM ${data.steam_app_id}` : data.gog_product_id ? `GOG ${data.gog_product_id}` : 'CATALOG ENTRY'}</small><h2 id="details-title">{data.title}</h2></div><button className="button" onClick={onClose} aria-label="Close game details">×</button></header>
      {data.artwork_hero_url && <img className="details-hero" src={data.artwork_hero_url} alt=""/>}
      <div className="details-main"><div className="details-cover"><GameCover title={data.title} cover={data.artwork_grid_url || data.cover_url || data.cover_image} backdrop={data.artwork_hero_url || data.backdrop_url}/>{data.artwork_logo_url && <img className="details-logo" src={data.artwork_logo_url} alt={`${data.title} logo`}/>}</div><div className="details-copy">
        {loading && <div className="detail-loading"><i/> Fetching store info and artwork…</div>}
        {error && <p className="detail-error">{error}</p>}
        <div className="detail-chips"><span>{data.release_year || data.year || 'Release year unknown'}</span><span>{data.platform_played || data.platform || data.platforms?.[0] || 'Multiple platforms'}</span><span>{data.status || 'In catalog'}</span>{data.metacritic_score != null && <a className="metacritic-score" href={data.metacritic_url || '#'} target="_blank" rel="noreferrer"><b>{data.metacritic_score}</b><small>METACRITIC</small></a>}{data.rawg_rating > 0 && <span>RAWG {Number(data.rawg_rating).toFixed(2)}/5 · {Number(data.rawg_rating_count || 0).toLocaleString()} ratings</span>}{data.rating_count > 0 && <span>RetroVault community {(Number(data.rating_avg || 0) / 2).toFixed(1)}/5 · {data.rating_count.toLocaleString()} ratings</span>}</div>
        <div className="detail-facts">{data.developer && <p><b>Developer</b><span>{data.developer}</span></p>}{data.publisher && <p><b>Publisher</b><span>{data.publisher}</span></p>}{data.genres?.length > 0 && <p><b>Genres</b><span>{data.genres.join(' · ')}</span></p>}{data.playtime_available === false ? <p><b>Playtime</b><span>Not reported by GOG</span></p> : data.playtime_minutes > 0 && <p><b>Playtime</b><span>{prettyTime(data.playtime_minutes)}</span></p>}</div>
        <p className="detail-summary">{data.summary || 'No description is available yet.'}</p>
        <div className="detail-links">{data.gog_product_id && data.slug && <a className="button primary" href={`https://www.gog.com/en/game/${encodeURIComponent(data.slug)}`} target="_blank" rel="noreferrer">GOG Store ↗</a>}{steamUrl && <><a className="button primary" href={steamUrl} target="_blank" rel="noreferrer">Steam Store ↗</a><a className="button" href={`steam://run/${data.steam_app_id}`}>Play ↗</a></>}{data.rawg_id && data.slug && <a className="button" href={`https://rawg.io/games/${encodeURIComponent(data.slug)}`} target="_blank" rel="noreferrer">RAWG ↗</a>}<a className="button" href={gridUrl} target="_blank" rel="noreferrer">More artwork ↗</a></div>
      </div></div>
      {!game.catalog_only && <form className="review-editor" onSubmit={async (event) => { event.preventDefault(); setSavingReview(true); try { await onSaveReview(game, reviewRating ? Number(reviewRating) : null, reviewText.trim()) } finally { setSavingReview(false) } }}><div><small>YOUR REVIEW</small><h3>Share your take</h3></div><label>Rating<select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)}><option value="">No rating</option>{Array.from({ length: 10 }, (_, index) => 10 - index).map((rating) => <option value={rating} key={rating}>{rating}/10</option>)}</select></label><label>Review<textarea rows="4" maxLength="5000" value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="What did you think of this game?"/><small>{reviewText.length}/5000 · public when your RetroVault profile is public</small></label><button className="button primary" disabled={savingReview}>{savingReview ? 'Saving…' : 'Save review'}</button></form>}
      {game.catalog_only && <div className="discovery-modal-action"><p>Add this game to your library and keep it in Backlog?</p><button className="button primary" onClick={() => onAddToBacklog(game)}>＋ Add to backlog</button></div>}
      {data.steam_app_id && <SteamReviewsPanel steamAppId={data.steam_app_id} gameTitle={data.title}/>}
      {reviews.length > 0 && <section className="details-community-reviews"><div className="review-feed-heading"><h3>RetroVault player reviews</h3><span>{reviews.length} reviews</span></div>{reviews.map((review) => <article className="external-review" key={review.id}><div className="community-review-author">{review.author.avatar_url && <img src={review.author.avatar_url} alt=""/>}<span><b>{review.author.username}{review.is_mine ? ' · You' : ''}</b><small>{review.rating ? `${review.rating}/10` : 'No rating'} · {new Date(review.updated_at).toLocaleDateString()}</small></span></div><p>{review.review_text}</p></article>)}</section>}
      {screenshots.length > 0 && <ScreenshotGallery images={screenshots} title={data.title}/>}
    </section>
  </div>
}

function ScreenshotGallery({ images, title }) {
  const [activeIndex, setActiveIndex] = useState(null)
  const closeButtonRef = useRef(null)
  const openerRef = useRef(null)
  const isOpen = activeIndex !== null
  const showImage = (index, event) => {
    openerRef.current = event.currentTarget
    setActiveIndex(index)
  }
  const close = useCallback(() => setActiveIndex(null), [])
  const move = useCallback((direction) => setActiveIndex((current) => (current + direction + images.length) % images.length), [images.length])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      else if (event.key === 'ArrowLeft' && images.length > 1) { event.preventDefault(); move(-1) }
      else if (event.key === 'ArrowRight' && images.length > 1) { event.preventDefault(); move(1) }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      openerRef.current?.focus()
    }
  }, [isOpen, close, images.length, move])

  return <>
    <div className="details-screenshots"><div><small>SCREENSHOTS</small><span>{images.length} images · click to preview</span></div><div className="screenshot-strip">{images.map((image, index) => <button className="screenshot-thumbnail" type="button" key={image} onClick={(event) => showImage(index, event)} aria-label={`Preview ${title} screenshot ${index + 1}`}><img src={image} loading="lazy" alt={`${title} screenshot ${index + 1}`}/></button>)}</div></div>
    {isOpen && createPortal(<div className="screenshot-viewer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section className="screenshot-viewer-dialog" role="dialog" aria-modal="true" aria-label={`${title} screenshots`}>
        <header className="screenshot-viewer-header"><div><small>{title} // SCREENSHOTS</small><strong aria-live="polite">{activeIndex + 1} / {images.length}</strong></div><button className="screenshot-viewer-close" type="button" onClick={close} ref={closeButtonRef} aria-label="Close image preview">×</button></header>
        <div className="screenshot-viewer-stage">
          {images.length > 1 && <button className="screenshot-viewer-nav previous" type="button" onClick={() => move(-1)} aria-label="Previous screenshot">‹</button>}
          <img className="screenshot-viewer-image" src={images[activeIndex]} alt={`${title} screenshot ${activeIndex + 1}`} fetchPriority="high"/>
          {images.length > 1 && <button className="screenshot-viewer-nav next" type="button" onClick={() => move(1)} aria-label="Next screenshot">›</button>}
        </div>
        <div className="screenshot-viewer-hint">Use ← and → to browse · Esc to close</div>
        {images.length > 1 && <div className="screenshot-viewer-thumbnails" aria-label="Choose screenshot">{images.map((image, index) => <button type="button" key={image} className={`screenshot-viewer-thumb ${index === activeIndex ? 'active' : ''}`} aria-current={index === activeIndex ? 'true' : undefined} aria-label={`Show screenshot ${index + 1}`} onClick={() => setActiveIndex(index)}><img src={image} loading="lazy" alt=""/></button>)}</div>}
      </section>
    </div>, document.body)}
  </>
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
  return <main className="app-shell"><header className="vgui-window top-window"><div className="titlebar"><a className="brand-lockup brand-home" href="/" aria-label="RetroVault Home"><img src="/retrovault-logo.png" alt="RetroVault" width="1254" height="1254"/><span><strong>Public Profile</strong><small>PLAYER COLLECTION AND STATS</small></span></a><a className="button" href="/">Open RetroVault</a></div></header><section className="vgui-window content-window public-owner">{profile.avatar_url && <img src={profile.avatar_url} alt=""/>}<div><small>STEAM PROFILE</small><h1>{profile.username}</h1>{profile.profile_url && <a href={profile.profile_url} target="_blank" rel="noreferrer">View Steam profile ↗</a>}</div></section><section className="stats-grid">{[['IN VAULT', stats.total], ['COMPLETED', `${stats.completed} (${stats.completionRate}%)`], ['PLAYTIME', prettyTime(stats.playtimeMinutes)], ['MEMBER SINCE', profile.steam_created_at ? new Date(profile.steam_created_at).getFullYear() : 'Steam']].map(([label, value]) => <div className="vgui-window stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section><section className="vgui-window content-window"><div className="section-heading"><div><small>SHARED COLLECTION</small><h1>Games</h1></div><span>{games.length} titles</span></div><div className="game-grid public-game-grid">{games.map((game) => <article className="game-card" key={game.id}><div className="poster"><GameCover title={game.title} cover={game.cover_image} backdrop={game.backdrop_url}/></div><div className="game-info"><div className="game-title"><b>{game.title}</b><span>{game.year || '—'} · {game.platform}</span></div><span>{game.status} · {game.playtime_available === false ? 'Playtime unavailable' : prettyTime(game.playtime_minutes)}</span>{game.rating && <span>Rating: {game.rating}/10</span>}</div></article>)}</div></section><footer className="statusbar"><span>RETROVAULT PUBLIC PROFILE</span><span>GAME DATA: RAWG + GAMEDB + STEAM</span><span>STEAM ID {steamId}</span></footer></main>
}
