import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import {
  addCatalogGame, deleteUserGame, getCatalogGameForUser, getLanMatches, getPublicProfileSummary, getSteamCatalogNeedingEnrichment,
  getUserGames, getUserPlayLogs, getUserProfile, searchCatalog, supabase, syncSteamGames,
  updateCatalogDetails, updateSteamCatalogMetadata, updateUserGame, updateUserGameStatus, updateUserProfile, upsertSteamProfile,
} from './supabase.js'

const app = express()
const PORT = Number(process.env.PORT || 3001)
const SESSION_SECRET = process.env.SESSION_SECRET
const STATUSES = ['Backlog', 'Playing', 'Completed', '100% Completed', 'Abandoned']
const THEMES = ['vgui-olive', 'source-obsidian', 'hev-hazard', 'lan-party-98']
const STEAM_OPENID = 'https://steamcommunity.com/openid/login'
const cookieName = 'retrovault_session'
const stateCookieName = 'retrovault_steam_state'

app.use(express.json({ limit: '100kb' }))
app.set('trust proxy', 1)

const sign = (value) => crypto.createHmac('sha256', SESSION_SECRET || 'missing-session-secret').update(value).digest('base64url')
const makeSession = (steamId) => {
  const payload = `${steamId}.${Date.now() + 30 * 24 * 60 * 60 * 1000}`
  return `${payload}.${sign(payload)}`
}
const getSessionUser = (req) => {
  if (!SESSION_SECRET) return null
  const token = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  if (!token) return null
  let decoded
  try { decoded = decodeURIComponent(token) } catch { return null }
  const [steamId, expiresAt, signature, extra] = decoded.split('.')
  if (!steamId || !/^\d{17}$/.test(steamId) || !expiresAt || !signature || extra || Number(expiresAt) < Date.now()) return null
  const expected = Buffer.from(sign(`${steamId}.${expiresAt}`))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? steamId : null
}
const requireUser = (req, res, next) => {
  const userId = getSessionUser(req)
  if (!userId) return res.status(401).json({ message: 'Log in with Steam to continue.' })
  req.userId = userId
  next()
}
const appOrigin = (req) => process.env.APP_URL || `${req.protocol}://${req.get('host')}`
const cookieOptions = (path = '/') => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path, maxAge: 30 * 24 * 60 * 60 * 1000 })
const setSessionCookie = (res, steamId) => res.cookie(cookieName, makeSession(steamId), cookieOptions())
const steamPlayer = async (steamId) => {
  if (!process.env.STEAM_API_KEY) return null
  const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')
  url.search = new URLSearchParams({ key: process.env.STEAM_API_KEY, steamids: steamId })
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Steam profile lookup failed (${response.status})`)
  return (await response.json()).response?.players?.[0] || null
}
const fetchSteamStoreDetails = async (ids) => {
  for (const item of ids.slice(0, 12)) {
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${item.steam_app_id}&l=en`, { signal: AbortSignal.timeout(7000) })
      if (!response.ok) continue
      const result = (await response.json())[item.steam_app_id]
      if (!result?.success || !result.data) continue
      const game = result.data
      const release = game.release_date?.date?.match(/(?:19|20)\d{2}/)?.[0]
      await updateSteamCatalogMetadata(item.steam_app_id, {
        release_year: Number(release) || null,
        developer: game.developers?.[0] || null,
        publisher: game.publishers?.[0] || null,
        summary: game.short_description || null,
        genres: (game.genres || []).map((genre) => genre.description).filter(Boolean),
        backdrop_url: game.background || null,
      })
    } catch (error) { console.warn(`Steam Store metadata skipped for ${item.steam_app_id}:`, error.message) }
  }
}
const stripHtml = (html = '') => html
  .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s+/g, '\n')
  .trim()

const fetchSteamGridDBArtwork = async (steamAppId) => {
  const apiKey = process.env.STEAMGRIDDB_API_KEY
  if (!apiKey) return {}
  const headers = { Authorization: `Bearer ${apiKey}` }
  const base = 'https://www.steamgriddb.com/api/v2'
  const externalGame = await fetch(`${base}/games/steam/${steamAppId}`, { headers, signal: AbortSignal.timeout(7000) })
  if (!externalGame.ok) return {}
  const game = (await externalGame.json()).data
  if (!game?.id) return {}
  const asset = async (kind, query) => {
    try {
      const response = await fetch(`${base}/${kind}/game/${game.id}?${new URLSearchParams(query)}`, { headers, signal: AbortSignal.timeout(7000) })
      return response.ok ? ((await response.json()).data || [])[0]?.url || null : null
    } catch { return null }
  }
  const [grid, hero, logo] = await Promise.all([
    asset('grids', { dimensions: '600x900', limit: '1', nsfw: 'false', humor: 'false' }),
    asset('heroes', { dimensions: '1920x620', limit: '1', nsfw: 'false', humor: 'false' }),
    asset('logos', { styles: 'official,white', limit: '1', nsfw: 'false', humor: 'false' }),
  ])
  return { artwork_grid_url: grid, artwork_hero_url: hero, artwork_logo_url: logo }
}

const loadGameDetails = async (userId, userGameId) => {
  const cached = await getCatalogGameForUser(userId, userGameId)
  const fresh = cached.details_updated_at && Date.now() - new Date(cached.details_updated_at).getTime() < 30 * 24 * 60 * 60 * 1000
  if (fresh && (cached.steam_app_id ? !process.env.STEAMGRIDDB_API_KEY || cached.artwork_grid_url : true)) return cached

  const details = { details_updated_at: new Date().toISOString() }
  if (cached.steam_app_id && !fresh) {
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${cached.steam_app_id}&l=en`, { signal: AbortSignal.timeout(9000) })
      const storeGame = (await response.json())[cached.steam_app_id]
      if (response.ok && storeGame?.success && storeGame.data) {
        const game = storeGame.data
        const release = game.release_date?.date?.match(/(?:19|20)\d{2}/)?.[0]
        details.summary = stripHtml(game.about_the_game || game.detailed_description || game.short_description || '')
        details.developer = game.developers?.[0] || undefined
        details.publisher = game.publishers?.[0] || undefined
        details.release_year = Number(release) || undefined
        details.genres = (game.genres || []).map((genre) => genre.description).filter(Boolean)
        details.metacritic_score = game.metacritic?.score ?? null
        details.metacritic_url = game.metacritic?.url || null
        details.screenshots = (game.screenshots || []).map((shot) => shot.path_full).filter(Boolean).slice(0, 20)
        details.backdrop_url = game.background || cached.backdrop_url
        details.details_updated_at = new Date().toISOString()
      }
    } catch (error) { console.warn(`Steam Store details unavailable for ${cached.steam_app_id}:`, error.message) }
  }

  if (cached.steam_app_id && process.env.STEAMGRIDDB_API_KEY && (!fresh || !cached.artwork_grid_url)) {
    try { Object.assign(details, await fetchSteamGridDBArtwork(cached.steam_app_id)) }
    catch (error) { console.warn(`SteamGridDB artwork unavailable for ${cached.steam_app_id}:`, error.message) }
  }
  return await updateCatalogDetails(cached.id, details) || cached
}

app.get('/api/health', async (_req, res) => {
  let database = false
  if (supabase) {
    const { error } = await supabase.from('profiles').select('steam_id', { head: true, count: 'exact' })
    database = !error
  }
  res.json({ ok: true, supabase: database, steamApi: Boolean(process.env.STEAM_API_KEY), sessionSecret: Boolean(SESSION_SECRET) })
})
app.get('/auth/steam', (req, res) => {
  if (!SESSION_SECRET) return res.status(503).send('Set SESSION_SECRET in .env before signing in.')
  if (!supabase) return res.status(503).send('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.')
  const origin = appOrigin(req)
  const state = crypto.randomBytes(24).toString('base64url')
  res.cookie(stateCookieName, state, { ...cookieOptions('/auth/steam/callback'), maxAge: 10 * 60 * 1000 })
  const returnTo = `${origin}/auth/steam/callback?state=${encodeURIComponent(state)}`
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup', 'openid.return_to': returnTo, 'openid.realm': origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select', 'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  })
  res.redirect(`${STEAM_OPENID}?${params}`)
})

app.get('/auth/steam/callback', async (req, res) => {
  try {
    const stateCookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${stateCookieName}=`))?.slice(stateCookieName.length + 1)
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const cookieBytes = Buffer.from(stateCookie || '')
    const queryBytes = Buffer.from(state)
    if (!stateCookie || !state || cookieBytes.length !== queryBytes.length || !crypto.timingSafeEqual(cookieBytes, queryBytes)) return res.status(401).send('Steam login session expired. Start the login again.')
    const claimedId = String(req.query['openid.claimed_id'] || '')
    const match = claimedId.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})\/?$/)
    if (!match || req.query['openid.mode'] !== 'id_res') return res.status(401).send('Steam login was not completed.')
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(req.query)) if (key.startsWith('openid.') && typeof value === 'string') params.set(key, value)
    params.set('openid.mode', 'check_authentication')
    const verified = await fetch(STEAM_OPENID, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(10000) })
    const response = await verified.text()
    if (!verified.ok || !/^is_valid:true\s*$/m.test(response)) return res.status(401).send('Steam could not verify this login.')
    const steamId = match[1]
    let player = null
    try { player = await steamPlayer(steamId) } catch (error) { console.warn('Could not fetch Steam profile:', error.message) }
    await upsertSteamProfile(steamId, player || {})
    res.clearCookie(stateCookieName, { ...cookieOptions('/auth/steam/callback'), maxAge: undefined })
    setSessionCookie(res, steamId)
    res.redirect(appOrigin(req))
  } catch (error) {
    console.error('Steam login failed:', error.message)
    res.status(502).send('Steam login could not be verified. Try again.')
  }
})

app.get('/api/auth/me', async (req, res) => {
  const steamId = getSessionUser(req)
  if (!steamId) return res.json({ user: null })
  try { res.json({ user: { id: steamId, provider: 'steam' }, profile: await getUserProfile(steamId) }) }
  catch (error) { res.status(500).json({ message: error.message }) }
})
app.post('/api/auth/logout', (_req, res) => res.clearCookie(cookieName, cookieOptions()).status(204).send())

app.get('/api/profile', requireUser, async (req, res) => {
  try { res.json(await getUserProfile(req.userId)) } catch (error) { res.status(500).json({ message: error.message }) }
})
app.patch('/api/profile', requireUser, async (req, res) => {
  if (req.body.preferred_theme && !THEMES.includes(req.body.preferred_theme)) return res.status(400).json({ message: 'Unsupported theme.' })
  try { res.json(await updateUserProfile(req.userId, req.body)) } catch (error) { res.status(400).json({ message: error.message }) }
})
app.get('/api/games', requireUser, async (req, res) => {
  try { res.json(await getUserGames(req.userId)) } catch (error) { res.status(500).json({ message: error.message }) }
})
app.get('/api/games/:id/details', requireUser, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ message: 'Invalid game ID.' })
  try { res.json(await loadGameDetails(req.userId, req.params.id)) }
  catch (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    res.status(status).json({ message: status === 404 ? 'Game not found in your vault.' : error.message })
  }
})
app.post('/api/games', requireUser, async (req, res) => {
  const { title, status } = req.body
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ message: 'Title is required.' })
  if (status && !STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid game status.' })
  try { res.status(201).json(await addCatalogGame({ ...req.body, title: title.trim() }, req.userId)) }
  catch (error) { res.status(500).json({ message: error.message || 'Failed to save game.' }) }
})
app.patch('/api/games/:id', requireUser, async (req, res) => {
  try {
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ message: 'Invalid game status.' })
      return res.json(await updateUserGameStatus(req.params.id, req.userId, req.body.status))
    }
    if (req.body.rating !== undefined && req.body.rating !== null && (!Number.isInteger(Number(req.body.rating)) || Number(req.body.rating) < 1 || Number(req.body.rating) > 10)) return res.status(400).json({ message: 'Rating must be an integer from 1 to 10.' })
    if (req.body.purchase_price !== undefined && req.body.purchase_price !== null && (!Number.isFinite(Number(req.body.purchase_price)) || Number(req.body.purchase_price) < 0)) return res.status(400).json({ message: 'Purchase price must be a non-negative number.' })
    if (req.body.is_favorite !== undefined && typeof req.body.is_favorite !== 'boolean') return res.status(400).json({ message: 'Favorite must be true or false.' })
    res.json(await updateUserGame(req.params.id, req.userId, req.body))
  } catch (error) { res.status(400).json({ message: error.message || 'Could not update game.' }) }
})
app.delete('/api/games/:id', requireUser, async (req, res) => {
  try { await deleteUserGame(req.params.id, req.userId); res.status(204).send() } catch (error) { res.status(404).json({ message: error.message }) }
})

app.get('/api/catalog/search', requireUser, async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100)
  if (query.length < 2) return res.json({ results: [], cached: true })
  try {
    const cached = await searchCatalog(query, 30)
    if (cached.length || !process.env.RAWG_API_KEY) return res.json({ results: cached, cached: true })
    const url = new URL('https://api.rawg.io/api/games')
    url.search = new URLSearchParams({ key: process.env.RAWG_API_KEY, search: query, page_size: '10' })
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return res.json({ results: [], cached: false, provider: 'rawg' })
    const result = await response.json()
    const rows = (result.results || []).filter((game) => game.id && game.name).map((game) => ({
      catalog_key: `rawg:${game.id}`, rawg_id: game.id, title: game.name,
      slug: game.slug || game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      release_year: Number(game.released?.slice(0, 4)) || null,
      genres: (game.genres || []).map((genre) => genre.name).filter(Boolean),
      platforms: (game.platforms || []).map((item) => item.platform?.name).filter(Boolean),
      cover_url: game.background_image || null, metadata_provider: 'rawg', metadata_updated_at: new Date().toISOString(),
    }))
    if (rows.length) {
      const saved = await supabase.from('games_catalog').upsert(rows, { onConflict: 'rawg_id', ignoreDuplicates: true })
      if (saved.error) throw saved.error
    }
    res.json({ results: await searchCatalog(query, 30), cached: false, provider: 'rawg' })
  } catch (error) { res.status(500).json({ message: error.message }) }
})
app.get('/api/steam/library', requireUser, async (req, res) => {
  if (!process.env.STEAM_API_KEY) return res.status(503).json({ message: 'Add STEAM_API_KEY to .env to sync your library.' })
  try {
    const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/')
    url.search = new URLSearchParams({ key: process.env.STEAM_API_KEY, steamid: req.userId, include_appinfo: 'true', include_played_free_games: 'true' })
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const body = await response.json()
    if (!response.ok || body.response?.games === undefined) return res.status(422).json({ message: 'Steam returned no visible games. Set your Steam game details to Public and try again.' })
    const result = await syncSteamGames(req.userId, body.response.games)
    const missing = await getSteamCatalogNeedingEnrichment(body.response.games.slice(0, 12).map((game) => game.appid))
    await fetchSteamStoreDetails(missing)
    res.json({ synced: result.imported, total: body.response.game_count ?? result.imported, playLogs: result.playLogs })
  } catch (error) { res.status(500).json({ message: error.message || 'Steam library sync failed.' }) }
})
app.get('/api/activity', requireUser, async (req, res) => {
  try { res.json(await getUserPlayLogs(req.userId, Math.min(Number(req.query.limit) || 100, 300))) } catch (error) { res.status(500).json({ message: error.message }) }
})
app.get('/api/public/profiles/:steamId', async (req, res) => {
  if (!/^\d{17}$/.test(req.params.steamId)) return res.status(400).json({ message: 'Invalid Steam ID.' })
  try {
    const profile = await getPublicProfileSummary(req.params.steamId)
    if (!profile) return res.status(404).json({ message: 'This profile is private or does not exist.' })
    res.json(profile)
  } catch (error) { res.status(500).json({ message: error.message }) }
})
app.get('/api/lan-matches/:steamId', requireUser, async (req, res) => {
  if (!/^\d{17}$/.test(req.params.steamId)) return res.status(400).json({ message: 'Invalid Steam ID.' })
  try {
    const profile = await getUserProfile(req.params.steamId)
    if (!profile?.is_public) return res.status(404).json({ message: 'That profile is private.' })
    res.json(await getLanMatches(req.userId, req.params.steamId))
  } catch (error) { res.status(500).json({ message: error.message }) }
})
app.get('/api/badge/:steamId.svg', async (req, res) => {
  if (!/^\d{17}$/.test(req.params.steamId)) return res.status(400).send('Invalid Steam ID')
  try {
    const profile = await getPublicProfileSummary(req.params.steamId)
    if (!profile) return res.status(404).send('Private profile')
    const label = `${profile.stats.completed} / ${profile.stats.total} games completed`
    const safe = label.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=300').send(`<svg xmlns="http://www.w3.org/2000/svg" width="250" height="28" role="img" aria-label="RetroVault ${safe}"><linearGradient id="g"><stop stop-color="#292b20"/><stop offset="1" stop-color="#53623b"/></linearGradient><rect width="250" height="28" rx="5" fill="#222"/><rect x="112" width="138" height="28" rx="5" fill="url(#g)"/><path d="M112 0h10v28h-10" fill="#222"/><text x="10" y="18" fill="#e8e8dc" font-family="Verdana,sans-serif" font-size="11">RETROVAULT</text><text x="124" y="18" fill="#fff" font-family="Verdana,sans-serif" font-size="10">${safe}</text></svg>`)
  } catch (error) { res.status(500).send(error.message) }
})

app.listen(PORT, () => console.log(`RetroVault API listening on http://localhost:${PORT}`))
