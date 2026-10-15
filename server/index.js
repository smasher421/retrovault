import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import {
  addCatalogGame, deleteUserGame, getCatalogGameForUser, getLanMatches, getPublicProfileSummary, getSteamCatalogNeedingEnrichment,
  getCatalogDiscover, getCatalogGameById, getReviewsFeed, getUserGames, getUserPlayLogs, getUserProfile, searchCatalog, supabase, syncSteamGames,
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
const isPlaceholderSteamName = (username) => !username || /^steam(?:\s+user)?(?:\s+\d+)?$/i.test(username.trim())
const fetchSteamStoreDetails = async (ids) => {
  const enrich = async (item) => {
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${item.steam_app_id}&l=en`, { signal: AbortSignal.timeout(7000) })
      if (!response.ok) return
      const result = (await response.json())[item.steam_app_id]
      if (!result?.success || !result.data) return
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
  const batch = ids.slice(0, 12)
  for (let index = 0; index < batch.length; index += 4) {
    await Promise.all(batch.slice(index, index + 4).map(enrich))
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

const fetchSteamGridDBArtworkByName = async (title) => {
  const apiKey = process.env.STEAMGRIDDB_API_KEY
  if (!apiKey || !title) return {}
  const base = 'https://www.steamgriddb.com/api/v2'
  const headers = { Authorization: `Bearer ${apiKey}` }
  const response = await fetch(`${base}/search/autocomplete/${encodeURIComponent(title)}`, { headers, signal: AbortSignal.timeout(7000) })
  if (!response.ok) return {}
  const candidates = (await response.json()).data || []
  const normalized = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const match = candidates.map((entry) => entry.data || entry).find((game) => normalized(game.name || '') === normalized(title))
  if (!match?.id) return {}
  const asset = async (kind, query) => {
    try {
      const result = await fetch(`${base}/${kind}/game/${match.id}?${new URLSearchParams(query)}`, { headers, signal: AbortSignal.timeout(7000) })
      return result.ok ? ((await result.json()).data || [])[0]?.url || null : null
    } catch { return null }
  }
  const [grid, hero, logo] = await Promise.all([
    asset('grids', { dimensions: '600x900', limit: '1', nsfw: 'false', humor: 'false' }),
    asset('heroes', { dimensions: '1920x620', limit: '1', nsfw: 'false', humor: 'false' }),
    asset('logos', { styles: 'official,white', limit: '1', nsfw: 'false', humor: 'false' }),
  ])
  return { artwork_grid_url: grid, artwork_hero_url: hero, artwork_logo_url: logo }
}

const fetchSteamCommunityReviews = async (steamAppId) => {
  const response = await fetch(`https://store.steampowered.com/appreviews/${steamAppId}?${new URLSearchParams({ json: '1', language: 'all', review_type: 'all', purchase_type: 'all', num_per_page: '10', filter: 'recent' })}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) return []
  const body = await response.json()
  return (body.reviews || []).map((review) => ({
    author: review.author?.steamid ? `Steam player ${review.author.steamid.slice(-5)}` : 'Steam player',
    text: review.review,
    recommended: Boolean(review.voted_up),
    helpful: review.votes_up || 0,
    created_at: review.timestamp_created ? new Date(review.timestamp_created * 1000).toISOString() : null,
    source: 'Steam',
  })).filter((review) => review.text).slice(0, 10)
}

const enrichCatalogDetails = async (cached) => {
  const fresh = cached.details_updated_at && Date.now() - new Date(cached.details_updated_at).getTime() < 30 * 24 * 60 * 60 * 1000
  const noArtwork = !cached.artwork_grid_url && !cached.cover_url && !cached.backdrop_url
  if (fresh && !noArtwork && (!cached.steam_app_id || !process.env.STEAMGRIDDB_API_KEY || cached.artwork_grid_url)) {
    if (!cached.steam_app_id) return cached
    try { return { ...cached, community_reviews: await fetchSteamCommunityReviews(cached.steam_app_id) } }
    catch { return { ...cached, community_reviews: [] } }
  }

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
  if (!cached.steam_app_id && !fresh) {
    if (process.env.STEAMGRIDDB_API_KEY && !details.artwork_grid_url) {
      try { Object.assign(details, await fetchSteamGridDBArtworkByName(cached.title)) }
      catch (error) { console.warn(`SteamGridDB artwork unavailable for ${cached.title}:`, error.message) }
    }
  }
  if (cached.steam_app_id) {
    try { details.community_reviews = await fetchSteamCommunityReviews(cached.steam_app_id) }
    catch (error) { console.warn(`Steam reviews unavailable for ${cached.title}:`, error.message) }
  }
  const updated = await updateCatalogDetails(cached.id, details) || cached
  return { ...updated, community_reviews: details.community_reviews || [] }
}
const loadGameDetails = async (userId, userGameId) => enrichCatalogDetails(await getCatalogGameForUser(userId, userGameId))

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, supabase: Boolean(supabase), steamApi: Boolean(process.env.STEAM_API_KEY), sessionSecret: Boolean(SESSION_SECRET) })
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
  let stage = 'callback validation'
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
    stage = 'Steam OpenID verification'
    const verified = await fetch(STEAM_OPENID, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(10000) })
    const response = await verified.text()
    if (!verified.ok || !/^is_valid:true\s*$/m.test(response)) return res.status(401).send('Steam could not verify this login.')
    const steamId = match[1]
    let player = null
    try { player = await steamPlayer(steamId) } catch (error) { console.warn('Could not fetch Steam profile:', error.message) }
    stage = 'Supabase profile save'
    await upsertSteamProfile(steamId, player || {})
    res.clearCookie(stateCookieName, { ...cookieOptions('/auth/steam/callback'), maxAge: undefined })
    setSessionCookie(res, steamId)
    res.redirect(appOrigin(req))
  } catch (error) {
    console.error(`Steam login failed during ${stage}:`, error.message)
    res.status(502).send('Steam login could not be verified. Try again.')
  }
})

app.get('/api/auth/me', async (req, res) => {
  const steamId = getSessionUser(req)
  if (!steamId) return res.json({ user: null })
  try {
    let profile = await getUserProfile(steamId)
    if (isPlaceholderSteamName(profile?.username) && process.env.STEAM_API_KEY) {
      try {
        const player = await steamPlayer(steamId)
        if (player?.personaname) profile = await upsertSteamProfile(steamId, player)
      } catch (error) { console.warn('Could not refresh Steam display name:', error.message) }
    }
    res.json({ user: { id: steamId, provider: 'steam' }, profile })
  }
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
app.get('/api/reviews', requireUser, async (req, res) => {
  try { res.json(await getReviewsFeed(req.userId, { limit: Math.min(Number(req.query.limit) || 40, 100) })) }
  catch (error) { res.status(500).json({ message: error.message }) }
})
app.get('/api/catalog/:catalogId/reviews', requireUser, async (req, res) => {
  if (!/^\d+$/.test(req.params.catalogId)) return res.status(400).json({ message: 'Invalid catalog ID.' })
  try { res.json(await getReviewsFeed(req.userId, { catalogId: Number(req.params.catalogId), limit: 100 })) }
  catch (error) { res.status(500).json({ message: error.message }) }
})
app.get('/api/catalog/:catalogId/details', requireUser, async (req, res) => {
  if (!/^\d+$/.test(req.params.catalogId)) return res.status(400).json({ message: 'Invalid catalog ID.' })
  try { res.json(await enrichCatalogDetails(await getCatalogGameById(Number(req.params.catalogId)))) }
  catch (error) { res.status(error.code === 'PGRST116' ? 404 : 502).json({ message: error.message }) }
})
app.get('/api/catalog/discover', requireUser, async (req, res) => {
  const platform = String(req.query.platform || '').trim().slice(0, 80)
  const genre = String(req.query.genre || '').trim().slice(0, 60)
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 100)
  try {
    const [catalog, discovered, ownedResult] = await Promise.all([
      getCatalogDiscover(req.userId, { limit: 100 }),
      discoverGameDbGames({ platform, genre }),
      supabase.from('user_games').select('catalog_id').eq('user_id', req.userId),
    ])
    if (ownedResult.error) throw ownedResult.error
    const ownedIds = new Set((ownedResult.data || []).map((row) => row.catalog_id))
    const matches = new Map()
    for (const game of [...discovered, ...catalog]) if (!ownedIds.has(game.id) && matchesDiscovery(game, platform, genre)) matches.set(game.id, game)
    const results = [...matches.values()]
    res.json({ results: results.slice((page - 1) * 24, page * 24), source: 'LizardByte GameDB + RetroVault', hasMore: results.length > page * 24, page, providerAvailable: true, message: 'Discovery uses the GameDB/IGDB index and your shared RetroVault catalog.' })
  } catch (error) {
    console.warn('Catalog discovery failed:', error.message)
    try {
      const results = (await getCatalogDiscover(req.userId, { limit: 100 })).filter((game) => matchesDiscovery(game, platform, genre))
      return res.json({ results: results.slice((page - 1) * 24, page * 24), source: 'RetroVault catalog', hasMore: false, page, providerAvailable: false, message: `${error.message} Showing cached catalog matches.` })
    } catch { return res.status(502).json({ message: error.message || 'Game discovery is unavailable.' }) }
  }
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
  try {
    let game = await addCatalogGame({ ...req.body, title: title.trim() }, req.userId)
    if (!game.cover_image && game.catalog_id) {
      try {
        const enriched = await enrichCatalogDetails(await getCatalogGameById(game.catalog_id))
        game = { ...game, cover_image: enriched.artwork_grid_url || enriched.cover_url || enriched.backdrop_url || '', backdrop_url: enriched.artwork_hero_url || enriched.backdrop_url || '' }
      } catch (error) { console.warn(`Could not find artwork for ${game.title}:`, error.message) }
    }
    res.status(201).json(game)
  }
  catch (error) { res.status(500).json({ message: error.message || 'Failed to save game.' }) }
})
app.patch('/api/games/:id', requireUser, async (req, res) => {
  try {
    if (req.body.review_text !== undefined && (typeof req.body.review_text !== 'string' || req.body.review_text.length > 5000)) return res.status(400).json({ message: 'A review must be plain text with at most 5,000 characters.' })
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

const gameDbSearchCache = new Map()
const gameDbDetailsCache = new Map()
const gameDbPlatformCache = new Map()
let gameDbPlatformsPromise
const GAME_DB_ROOT = 'https://app.lizardbyte.dev/GameDB'
const discoverySeeds = [
  'The Legend of Zelda: Ocarina of Time','The Legend of Zelda: Breath of the Wild','The Legend of Zelda: Tears of the Kingdom','Super Mario 64','Super Mario Odyssey','Super Mario World','Super Mario Bros. 3','Metroid Prime','Super Metroid','Metroid Dread','Pokémon Red','Pokémon Emerald','Pokémon HeartGold','Pokémon Black','Mario Kart 8 Deluxe','Mario Kart Wii','Animal Crossing: New Horizons','GoldenEye 007','Banjo-Kazooie','F-Zero GX','Fire Emblem: Three Houses','Xenoblade Chronicles','Splatoon 3',
  'Burnout Dominator','Burnout 3: Takedown','Need for Speed: Most Wanted','Gran Turismo 4','Gran Turismo 7','Forza Horizon 5','SSX 3','Tony Hawk\'s Underground 2','Wipeout Pulse','Midnight Club 3: DUB Edition','Crazy Taxi','Sonic Adventure 2','Jet Set Radio','Shenmue','Virtua Fighter 4','Streets of Rage 2','Sonic the Hedgehog 2','Panzer Dragoon Saga',
  'God of War','God of War Ragnarök','The Last of Us','Uncharted 2: Among Thieves','Shadow of the Colossus','Bloodborne','Demon\'s Souls','Marvel\'s Spider-Man 2','Ratchet & Clank: Rift Apart','Ghost of Tsushima','Metal Gear Solid 3: Snake Eater','Final Fantasy VII','Final Fantasy X','Persona 5 Royal','Chrono Trigger','Castlevania: Symphony of the Night','Silent Hill 2','Resident Evil 4','Resident Evil 2','Devil May Cry 3: Dante\'s Awakening',
  'Halo 3','Gears of War 2','Fable II','Ninja Gaiden Black','Forza Motorsport 4','The Elder Scrolls V: Skyrim','Fallout: New Vegas','Red Dead Redemption 2','Grand Theft Auto V','Grand Theft Auto: San Andreas','The Witcher 3: Wild Hunt','Cyberpunk 2077','Baldur\'s Gate 3','Elden Ring','Dark Souls','Sekiro: Shadows Die Twice','Hades','Hollow Knight','Celeste','Stardew Valley','Minecraft','Portal 2','Half-Life 2','Left 4 Dead 2','Doom Eternal','BioShock','Mass Effect 2','XCOM 2','Civilization VI','Age of Empires II','The Sims 4','Tetris Effect','Street Fighter 6','Mortal Kombat 11','Tekken 8','Overcooked! 2','It Takes Two','Among Us','Super Meat Boy','Cuphead','Disco Elysium','Outer Wilds','The Talos Principle','Papers, Please','Return of the Obra Dinn','Slay the Spire','Subnautica','Terraria','Factorio','RimWorld','TrackMania','FIFA 23','NBA 2K24','Wii Sports','Kirby and the Forgotten Land','Donkey Kong Country','Sega Rally Championship','Daytona USA','Phantasy Star Online','Golden Sun','Advance Wars','The World Ends with You','Lumines','Patapon','LocoRoco','Okami','Ōkami','Viewtiful Joe','Ico','Resistance 3','inFAMOUS 2','The Orange Box','Team Fortress 2','Counter-Strike 2','Valheim','Braid','Limbo','Inside','What Remains of Edith Finch','Journey','Gris','Spelunky 2','Dead Cells','A Short Hike','Dredge','Balatro','Vampire Survivors','The Binding of Isaac: Rebirth','Risk of Rain 2','Monster Hunter: World','Dragon Quest XI','Yakuza 0','Like a Dragon: Infinite Wealth','Ōkami HD','Burnout Paradise Remastered'
]
const getGameDbBucket = (query) => {
  const prefix = query.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toLocaleLowerCase()
  return prefix || '@'
}
const searchGameDb = async (query) => {
  const bucket = getGameDbBucket(query)
  const cached = gameDbSearchCache.get(bucket)
  let entries = cached?.expiresAt > Date.now() ? cached.games : null
  if (!entries) {
    const response = await fetch(`${GAME_DB_ROOT}/buckets/${encodeURIComponent(bucket)}.json`, { signal: AbortSignal.timeout(7000) })
    if (!response.ok) throw new Error(`GameDB search failed (${response.status})`)
    const data = await response.json()
    entries = Object.entries(data).map(([id, game]) => ({ id, title: game.name })).filter((game) => game.title)
    gameDbSearchCache.set(bucket, { games: entries, expiresAt: Date.now() + 60 * 60 * 1000 })
  }
  const normalized = query.trim().toLocaleLowerCase()
  return entries
    .filter((game) => game.title.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => {
      const rank = (title) => title.toLocaleLowerCase() === normalized ? 0 : title.toLocaleLowerCase().startsWith(normalized) ? 1 : 2
      return rank(a.title) - rank(b.title) || a.title.localeCompare(b.title)
    })
    .slice(0, 10)
    .map((game) => ({ id: `gamedb:${game.id}`, gamedb_id: Number(game.id), title: game.title, metadata_provider: 'gamedb', genres: [], platforms: [] }))
}
const fetchGameDbDetails = async (igdbId) => {
  const cached = gameDbDetailsCache.get(igdbId)
  if (cached?.expiresAt > Date.now()) return cached.game
  const response = await fetch(`${GAME_DB_ROOT}/games/${encodeURIComponent(igdbId)}.json`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`GameDB details failed (${response.status})`)
  const item = await response.json()
  if (!item?.id || !item?.name) throw new Error('GameDB returned incomplete game details.')
  if (!gameDbPlatformsPromise) gameDbPlatformsPromise = fetch(`${GAME_DB_ROOT}/platforms/all.json`, { signal: AbortSignal.timeout(7000) })
    .then((platformResponse) => platformResponse.ok ? platformResponse.json() : {})
    .then((platforms) => { for (const [id, platform] of Object.entries(platforms)) if (platform.name) gameDbPlatformCache.set(Number(id), platform.name) })
    .catch(() => {})
  await gameDbPlatformsPromise
  const platformIds = Array.isArray(item.platforms) ? item.platforms : []
  const platforms = (await Promise.all(platformIds.map(async (platform) => {
    if (typeof platform === 'string') return platform
    if (platform?.name) return platform.name
    const id = typeof platform === 'number' ? platform : platform?.id
    if (!id) return null
    const cachedPlatform = gameDbPlatformCache.get(id)
    if (cachedPlatform) return cachedPlatform
    try {
      const platformResponse = await fetch(`${GAME_DB_ROOT}/platforms/${id}.json`, { signal: AbortSignal.timeout(5000) })
      if (!platformResponse.ok) return null
      const name = (await platformResponse.json()).name || null
      if (name) gameDbPlatformCache.set(id, name)
      return name
    } catch { return null }
  }))).filter(Boolean)
  const genres = Array.isArray(item.genres) ? item.genres.map((genre) => typeof genre === 'string' ? genre : genre.name).filter(Boolean) : []
  const cover = item.cover?.url ? item.cover.url.replace('//images.igdb.com/', 'https://images.igdb.com/').replace('t_thumb', 't_cover_big') : null
  const releaseYear = item.first_release_date
    ? new Date((typeof item.first_release_date === 'number' ? item.first_release_date * 1000 : item.first_release_date)).getUTCFullYear()
    : item.release_dates?.map((release) => release.y || (release.date ? new Date(release.date * 1000).getUTCFullYear() : null)).filter(Boolean).sort((a, b) => a - b)[0] || null
  const companies = item.involved_companies || []
  const game = {
    catalog_key: `gamedb:${item.id}`, igdb_id: item.id, title: item.name,
    slug: item.slug || null,
    release_year: releaseYear,
    developer: companies.find((entry) => entry.developer)?.company?.name || null,
    publisher: companies.find((entry) => entry.publisher)?.company?.name || null,
    summary: item.summary || item.storyline || null,
    genres, platforms, cover_url: cover, backdrop_url: cover,
    metadata_provider: 'gamedb', metadata_updated_at: new Date().toISOString(),
  }
  gameDbDetailsCache.set(igdbId, { game, expiresAt: Date.now() + 60 * 60 * 1000 })
  return game
}
const discoveryCache = new Map()
const normalizeGameText = (value = '') => value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')
const matchesDiscovery = (game, platform, genre) => {
  const platformName = normalizeGameText(platform)
  const platformAliases = {
    playstation: ['playstation'], ps: ['playstation'], xbox: ['xbox'], nintendo: ['nintendo'], sega: ['sega'],
    pc: ['pc', 'windows', 'linux', 'mac'], steamdeck: ['pc', 'windows', 'linux'], arcade: ['arcade'],
  }
  const supportedPlatforms = (game.platforms || []).map(normalizeGameText)
  const platformMatch = !platform || (platformName === 'other' ? false : (platformAliases[platformName] || [platformName]).some((alias) => supportedPlatforms.some((item) => item.includes(alias))))
  const genreName = normalizeGameText(genre)
  const genreAliases = { rpg: ['rpg', 'roleplaying'], indie: ['indie'] }
  const genres = (game.genres || []).map(normalizeGameText)
  const genreMatch = !genre || (genreAliases[genreName] || [genreName]).some((alias) => genres.some((item) => item.includes(alias)))
  return platformMatch && genreMatch
}
const discoverGameDbGames = async ({ platform = '', genre = '' }) => {
  const key = JSON.stringify([platform, genre])
  const cached = discoveryCache.get(key)
  if (cached?.expiresAt > Date.now()) return cached.games
  const bucketKeys = [...new Set(discoverySeeds.map(getGameDbBucket))]
  const bucketResults = await Promise.allSettled(bucketKeys.map(async (bucket) => {
    const cachedBucket = gameDbSearchCache.get(bucket)
    if (cachedBucket?.expiresAt > Date.now()) return [bucket, cachedBucket.games]
    const response = await fetch(`${GAME_DB_ROOT}/buckets/${encodeURIComponent(bucket)}.json`, { signal: AbortSignal.timeout(7000) })
    if (!response.ok) throw new Error(`GameDB search failed (${response.status})`)
    const entries = Object.entries(await response.json()).map(([id, item]) => ({ id, title: item.name })).filter((item) => item.title)
    gameDbSearchCache.set(bucket, { games: entries, expiresAt: Date.now() + 60 * 60 * 1000 })
    return [bucket, entries]
  }))
  const buckets = new Map(bucketResults.filter((result) => result.status === 'fulfilled').map((result) => result.value))
  const ids = new Map()
  for (const title of discoverySeeds) {
    const match = (buckets.get(getGameDbBucket(title)) || []).find((item) => normalizeGameText(item.title) === normalizeGameText(title))
    if (match) ids.set(match.id, { id: `gamedb:${match.id}`, gamedb_id: Number(match.id), title: match.title })
  }
  const candidates = [...ids.values()]
  const detailed = []
  for (let index = 0; index < candidates.length; index += 16) {
    const batch = await Promise.allSettled(candidates.slice(index, index + 16).map((item) => fetchGameDbDetails(item.gamedb_id)))
    for (const result of batch) if (result.status === 'fulfilled' && matchesDiscovery(result.value, platform, genre)) detailed.push(result.value)
  }
  if (detailed.length) {
    const { error } = await supabase.from('games_catalog').upsert(detailed, { onConflict: 'igdb_id', ignoreDuplicates: true })
    if (error) throw error
    const { data, error: selectError } = await supabase.from('games_catalog')
      .select('id,catalog_key,steam_app_id,igdb_id,title,slug,release_year,developer,publisher,summary,genres,platforms,cover_url,backdrop_url,artwork_grid_url,artwork_hero_url,metacritic_score,rating_avg,rating_count,co_op,multiplayer,metadata_provider')
      .in('igdb_id', detailed.map((game) => game.igdb_id))
    if (selectError) throw selectError
    const saved = new Map((data || []).map((item) => [item.igdb_id, item]))
    const games = detailed.map((game) => saved.get(game.igdb_id)).filter(Boolean)
    discoveryCache.set(key, { games, expiresAt: Date.now() + 60 * 60 * 1000 })
    return games
  }
  discoveryCache.set(key, { games: [], expiresAt: Date.now() + 15 * 60 * 1000 })
  return []
}

app.get('/api/catalog/search', requireUser, async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100)
  if (query.length < 2) return res.json({ results: [], cached: true, providerAvailable: true, providers: ['gamedb', 'retrovault'] })
  try {
    const providerTasks = [
      searchCatalog(query, 30).then((games) => ({ kind: 'local', games })),
      searchGameDb(query).then((games) => ({ kind: 'gamedb', games })),
    ]
    const settled = await Promise.allSettled(providerTasks)
    const resultsByProvider = new Map()
    let providerError = false
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index]
      if (result.status === 'fulfilled') resultsByProvider.set(result.value.kind, result.value.games)
      else {
        providerError = true
        console.warn(`${['RetroVault', 'GameDB'][index]} catalog search failed:`, result.reason?.message || result.reason)
      }
    }
    const localGames = resultsByProvider.get('local') || []
    const gameDbGames = resultsByProvider.get('gamedb') || []
    const byId = new Map(localGames.map((game) => [game.id, game]))
    const normalized = query.toLocaleLowerCase()
    const results = [...byId.values(), ...gameDbGames.filter((game) => ![...byId.values()].some((existing) => existing.title.toLocaleLowerCase() === game.title.toLocaleLowerCase()))].sort((a, b) => {
      const rank = (title) => title.toLocaleLowerCase() === normalized ? 0 : title.toLocaleLowerCase().startsWith(normalized) ? 1 : title.toLocaleLowerCase().includes(normalized) ? 2 : 3
      return rank(a.title) - rank(b.title) || (b.rating_count || 0) - (a.rating_count || 0)
    })
    res.json({ results: results.slice(0, 30), cached: false, providerAvailable: true, providers: ['GameDB', 'RetroVault'], providerError })
  } catch (error) { res.status(500).json({ message: error.message }) }
})
app.post('/api/catalog/gamedb/:igdbId', requireUser, async (req, res) => {
  if (!/^\d+$/.test(req.params.igdbId)) return res.status(400).json({ message: 'Invalid GameDB game ID.' })
  try {
    const game = await fetchGameDbDetails(req.params.igdbId)
    const { data, error } = await supabase.from('games_catalog').upsert(game, { onConflict: 'igdb_id' }).select('id,catalog_key,steam_app_id,igdb_id,rawg_id,title,slug,release_year,developer,publisher,summary,genres,platforms,cover_url,backdrop_url,time_to_beat_hours,rating_avg,rating_count,co_op,multiplayer,metadata_provider').single()
    if (error) throw error
    res.json(data)
  } catch (error) { res.status(502).json({ message: error.message || 'Could not load GameDB details.' }) }
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
    res.json({ synced: result.imported, total: body.response.game_count ?? result.imported, playLogs: result.playLogs })
    void getSteamCatalogNeedingEnrichment(body.response.games.slice(0, 12).map((game) => game.appid))
      .then(fetchSteamStoreDetails)
      .catch((error) => console.warn('Steam catalog enrichment skipped:', error.message))
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
