import crypto from 'node:crypto'
import { supabase } from './supabase.js'

// Public desktop client configuration also used by Heroic's gogdl.
// Protocol references and limitations are documented in README.md.
const CLIENT_ID = process.env.GOG_CLIENT_ID || '46899977096215655'
const CLIENT_SECRET = process.env.GOG_CLIENT_SECRET || '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9'
const REDIRECT = 'https://embed.gog.com/on_login_success?origin=client'
const attempts = new Map()
const jobs = new Map()
const storeCache = new Map()
const products = new Map()
const safeImage = (url) => typeof url === 'string' ? (url.startsWith('//') ? `https:${url}` : url).replace('{formatter}', 'ggvgl_2x') : ''
const plainText = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const validId = (value) => /^\d{1,20}$/.test(String(value || ''))
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data }

async function json(url, token) {
  let response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(12000) })
  } catch { throw new Error('GOG did not respond in time. Please try again.') }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'GOG authorization expired or this data is private. Reconnect your account.' : `GOG is unavailable (HTTP ${response.status}). Try again shortly.`)
  try { return await response.json() } catch { throw new Error('GOG returned an unexpected response. Please try again.') }
}

function encryptionKey() {
  const secret = process.env.GOG_TOKEN_SECRET || process.env.SESSION_SECRET
  if (!secret) throw new Error('The server needs SESSION_SECRET before connecting GOG.')
  return crypto.createHash('sha256').update(`retrovault:gog:${secret}`).digest()
}
function encrypt(userId, value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(userId))
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), payload].map((part) => part.toString('base64url')).join('.')
}
function decrypt(userId, value) {
  try {
    const [iv, tag, payload] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
    const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv)
    cipher.setAAD(Buffer.from(userId)); cipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([cipher.update(payload), cipher.final()]).toString('utf8'))
  } catch { throw new Error('Reconnect GOG to renew the saved account credentials.') }
}
async function exchange(params) {
  const url = new URL('https://auth.gog.com/token')
  url.search = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params })
  const tokens = await json(url)
  if (!tokens.access_token || !tokens.refresh_token || !validId(tokens.user_id)) throw new Error('GOG did not return a valid session. Start the connection again.')
  return { ...tokens, expires_at: Date.now() + Math.max(0, Number(tokens.expires_in) || 0) * 1000 }
}
const connection = async (userId) => unwrap(await supabase.from('gog_connections').select('*').eq('user_id', userId).maybeSingle())
const publicConnection = (row) => row ? { connected: true, username: row.username, avatar_url: row.avatar_url, connected_at: row.connected_at, last_synced_at: row.last_synced_at, summary: row.sync_summary } : { connected: false }

async function credentials(userId) {
  const row = await connection(userId)
  if (!row) throw new Error('Connect your GOG account from My Profile first.')
  let tokens = decrypt(userId, row.tokens_encrypted)
  if (tokens.expires_at < Date.now() + 60000) {
    tokens = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
    if (String(tokens.user_id) !== row.gog_user_id) throw new Error('GOG account changed. Reconnect to continue.')
    unwrap(await supabase.from('gog_connections').update({ tokens_encrypted: encrypt(userId, tokens) }).eq('user_id', userId))
  }
  return { row, tokens }
}

export async function gogStoreFeed(category = 'bestsellers', page = 1) {
  const key = `${category}:${page}`
  const cached = storeCache.get(key)
  if (cached?.expires > Date.now()) return cached.data
  const url = new URL('https://catalog.gog.com/v1/catalog')
  url.search = new URLSearchParams({ countryCode: 'RO', locale: 'en-US', currencyCode: 'EUR', productType: 'in:game,pack', page: String(page), limit: '48', order: category === 'new' ? 'desc:storeReleaseDate' : 'desc:bestselling' })
  if (category === 'deals') url.searchParams.set('discounted', 'eq:true')
  if (category === 'classics') url.searchParams.set('tags', 'in:classic')
  const result = await json(url)
  if (!Array.isArray(result.products)) throw new Error('GOG store listings are temporarily unavailable.')
  const games = result.products.map((game) => {
    products.set(String(game.id), { game, expires: Date.now() + 10 * 60000 })
    const final = game.price?.finalMoney
    const base = game.price?.baseMoney
    const amount = final?.amount != null && Number.isFinite(Number(final.amount)) ? Math.round(Number(final.amount) * 100) : null
    const initial = base?.amount != null && Number.isFinite(Number(base.amount)) ? Math.round(Number(base.amount) * 100) : null
    return {
      id: String(game.id), title: game.title, cover_url: safeImage(game.coverHorizontal),
      final_price: amount, original_price: initial, currency: final?.currency || null,
      discount_percent: amount != null && initial > amount ? Math.round((1 - amount / initial) * 100) : 0,
      store_url: `https://www.gog.com/en/game/${encodeURIComponent(game.slug)}`,
      release_year: Number(game.releaseDate?.slice(0, 4)) || null,
      genres: (game.genres || []).map((genre) => genre.name),
    }
  })
  const data = { games, page, hasMore: page < Number(result.pages), country: 'RO', updated_at: new Date().toISOString() }
  storeCache.set(key, { data, expires: Date.now() + 10 * 60000 })
  if (storeCache.size > 80) storeCache.delete(storeCache.keys().next().value)
  while (products.size > 2000) products.delete(products.keys().next().value)
  return data
}

async function catalogGame(id) {
  const cached = products.get(String(id))
  const card = cached?.expires > Date.now() ? cached.game : null
  const game = await json(`https://api.gog.com/products/${id}?expand=description,screenshots`)
  if (!game.title || !game.id) throw new Error('GOG could not find this product.')
  if (!['game', 'pack'].includes(game.game_type)) return null
  const screenshots = (card?.screenshots || game.screenshots?.map((shot) => shot.formatter_template_url) || []).map(safeImage).filter(Boolean).slice(0, 20)
  // Never replace richer metadata with empty values during a library resync.
  const row = {
    catalog_key: `gog:${id}`, gog_product_id: Number(id), title: game.title, slug: game.slug,
    platforms: ['PC', ...(game.content_system_compatibility?.osx ? ['Mac'] : []), ...(game.content_system_compatibility?.linux ? ['Linux'] : [])],
    cover_url: safeImage(card?.coverVertical || game.images?.logo2x || game.images?.logo),
    backdrop_url: safeImage(card?.galaxyBackgroundImage || game.images?.background),
    summary: plainText(game.description?.full || game.description?.lead),
    metadata_provider: 'gog', metadata_updated_at: new Date().toISOString(),
    ...(screenshots.length ? { screenshots } : {}),
    ...(card?.genres?.length ? { genres: card.genres.map((genre) => genre.name) } : {}),
    ...(card?.developers?.[0] ? { developer: card.developers[0] } : {}),
    ...(card?.publishers?.[0] ? { publisher: card.publishers[0] } : {}),
    ...(card?.releaseDate ? { release_year: Number(card.releaseDate.slice(0, 4)) || null } : {}),
  }
  return unwrap(await supabase.from('games_catalog').upsert(row, { onConflict: 'gog_product_id' }).select().single())
}

async function library(tokens) {
  const games = new Set()
  const pages = new Set()
  let next = ''
  do {
    const url = new URL(`https://galaxy-library.gog.com/users/${tokens.user_id}/releases`)
    if (next) url.searchParams.set('page_token', next)
    const result = await json(url, tokens.access_token)
    if (!Array.isArray(result.items)) throw new Error('GOG did not return a complete library. Your saved games are unchanged.')
    for (const game of result.items) if (game.platform_id === 'gog' && game.owned !== false && validId(game.external_id)) games.add(String(game.external_id))
    next = result.next_page_token || ''
    if (next && pages.has(next)) throw new Error('GOG library pagination stalled. Please sync again later.')
    pages.add(next)
    if (pages.size > 500) throw new Error('GOG library is too large for a single sync.')
  } while (next)
  return [...games]
}

async function syncLibrary(userId, job) {
  let { row, tokens } = await credentials(userId)
  const identity = await json(`https://users.gog.com/users/${tokens.user_id}`, tokens.access_token)
  if (!identity.username) throw new Error('GOG did not return your profile. Reconnect and try again.')
  unwrap(await supabase.from('gog_connections').update({ username: identity.username, avatar_url: safeImage(identity.avatar?.large_2x || identity.avatar?.large) }).eq('user_id', userId))
  const ids = await library(tokens)
  job.total = ids.length
  for (let offset = 0; offset < ids.length; offset += 6) {
    if (tokens.expires_at < Date.now() + 60000) ({ row, tokens } = await credentials(userId))
    const batch = await Promise.all(ids.slice(offset, offset + 6).map(async (id) => {
      let game
      try {
        const existing = unwrap(await supabase.from('games_catalog').select('id,metadata_updated_at').eq('gog_product_id', Number(id)).maybeSingle())
        game = existing && Date.parse(existing.metadata_updated_at) > Date.now() - 7 * 86400000 ? existing : await catalogGame(id)
      } catch { job.failed += 1; return null }
      if (!game) { job.skipped += 1; return null }
      let minutes = null
      let lastPlayed = null
      try {
        const stats = await json(`https://gameplay.gog.com/games/${id}/users/${tokens.user_id}/sessions`, tokens.access_token)
        // GOG's time_sum is in minutes (same unit as its session writes).
        if (stats.time_sum != null && Number.isFinite(Number(stats.time_sum)) && Number(stats.time_sum) >= 0) minutes = Math.floor(Number(stats.time_sum))
        const dates = (Array.isArray(stats.items) ? stats.items : []).map((session) => Date.parse(session.session_date)).filter(Number.isFinite)
        if (dates.length) lastPlayed = new Date(Math.max(...dates)).toISOString()
      } catch { /* Ownership still imports when Galaxy playtime is private/unavailable. */ }
      if (minutes === null) job.statsUnavailable += 1
      return { catalog_id: game.id, playtime_minutes: minutes, last_played_at: lastPlayed }
    }))
    const rows = batch.filter(Boolean)
    if (rows.length) job.imported += unwrap(await supabase.rpc('sync_gog_library', { p_user_id: userId, p_gog_user_id: row.gog_user_id, p_games: rows })) || 0
    job.processed = Math.min(offset + 6, ids.length)
  }
  const summary = { owned: ids.length, imported: job.imported, failed: job.failed, skipped: job.skipped, stats_unavailable: job.statsUnavailable }
  unwrap(await supabase.from('gog_connections').update({ last_synced_at: new Date().toISOString(), sync_summary: summary }).eq('user_id', userId))
  job.status = 'complete'
  job.message = `${job.imported} GOG games synced.${job.failed ? ` ${job.failed} could not be loaded; sync again to retry.` : ''}${job.statsUnavailable ? ` Playtime unavailable for ${job.statsUnavailable} games.` : ''}`
}

export function registerGogRoutes(app, requireUser, appOrigin) {
  const mutate = (req, res, next) => {
    const origin = req.get('origin')
    if (origin && origin !== new URL(appOrigin(req)).origin) return res.status(403).json({ message: 'Open this action from RetroVault.' })
    if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ message: 'Open this action from RetroVault.' })
    next()
  }
  const route = (fn) => async (req, res) => {
    try { if (!supabase) throw new Error('Supabase is not configured.'); await fn(req, res) }
    catch (error) { res.status(502).json({ message: error.message }) }
  }
  app.get('/api/store/gog', requireUser, route(async (req, res) => {
    const category = String(req.query.category || 'bestsellers')
    if (!['bestsellers', 'new', 'deals', 'classics'].includes(category)) return res.status(400).json({ message: 'Choose a valid GOG shelf.' })
    const page = Math.min(200, Math.max(1, Math.floor(Number(req.query.page) || 1)))
    res.json(await gogStoreFeed(category, page))
  }))
  app.post('/api/store/gog/:id/catalog', requireUser, mutate, route(async (req, res) => {
    if (!/^\d{1,12}$/.test(req.params.id)) return res.status(400).json({ message: 'Invalid GOG product ID.' })
    const game = await catalogGame(req.params.id)
    if (!game) return res.status(404).json({ message: 'This product is not a game.' })
    res.json(game)
  }))
  app.get('/api/accounts/gog', requireUser, route(async (req, res) => {
    res.set('Cache-Control', 'no-store').json({ ...publicConnection(await connection(req.userId)), job: jobs.get(req.userId) || null })
  }))
  app.post('/api/accounts/gog/start', requireUser, mutate, route(async (req, res) => {
    if (jobs.get(req.userId)?.status === 'running') return res.status(409).json({ message: 'Wait for the current GOG sync to finish.' })
    encryptionKey()
    for (const [id, attempt] of attempts) if (attempt.expires < Date.now()) attempts.delete(id)
    const state = crypto.randomBytes(32).toString('base64url')
    attempts.set(req.userId, { state, expires: Date.now() + 10 * 60000 })
    const url = new URL('https://auth.gog.com/auth')
    url.search = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', layout: 'client2', state })
    res.set('Cache-Control', 'no-store').json({ url: url.toString(), state })
  }))
  app.post('/api/accounts/gog/connect', requireUser, mutate, route(async (req, res) => {
    const attempt = attempts.get(req.userId)
    if (!attempt || attempt.expires < Date.now() || attempt.state !== req.body.state) return res.status(400).json({ message: 'The connection window expired. Start Connect GOG again.' })
    let callback
    try { callback = new URL(String(req.body.callback || '').trim()) } catch { return res.status(400).json({ message: 'Paste the full GOG success URL from the address bar.' }) }
    const code = callback.searchParams.get('code')
    if (callback.origin !== 'https://embed.gog.com' || callback.pathname !== '/on_login_success' || !code || code.length > 2048 || (callback.searchParams.has('state') && callback.searchParams.get('state') !== attempt.state)) return res.status(400).json({ message: 'Use the success URL from the GOG sign-in window you just opened.' })
    if (jobs.get(req.userId)?.status === 'running') return res.status(409).json({ message: 'Wait for the current GOG sync to finish.' })
    attempts.delete(req.userId)
    const tokens = await exchange({ grant_type: 'authorization_code', redirect_uri: REDIRECT, code })
    const identity = await json(`https://users.gog.com/users/${tokens.user_id}`, tokens.access_token)
    if (!identity.username) throw new Error('GOG could not provide your account name.')
    const row = unwrap(await supabase.from('gog_connections').upsert({ user_id: req.userId, gog_user_id: String(tokens.user_id), username: identity.username, avatar_url: safeImage(identity.avatar?.large_2x || identity.avatar?.large), tokens_encrypted: encrypt(req.userId, tokens), connected_at: new Date().toISOString(), last_synced_at: null, sync_summary: {} }).select().single())
    jobs.delete(req.userId)
    res.set('Cache-Control', 'no-store').json(publicConnection(row))
  }))
  app.post('/api/accounts/gog/sync', requireUser, mutate, route(async (req, res) => {
    const current = jobs.get(req.userId)
    if (current?.status === 'running') return res.status(202).json(current)
    if (!await connection(req.userId)) return res.status(400).json({ message: 'Connect GOG before syncing.' })
    const job = { status: 'running', total: 0, processed: 0, imported: 0, failed: 0, skipped: 0, statsUnavailable: 0, started_at: new Date().toISOString() }
    jobs.set(req.userId, job)
    void syncLibrary(req.userId, job).catch((error) => { job.status = 'error'; job.message = error.message })
    res.status(202).json(job)
  }))
  app.delete('/api/accounts/gog', requireUser, mutate, route(async (req, res) => {
    if (jobs.get(req.userId)?.status === 'running') return res.status(409).json({ message: 'Wait for the current sync before disconnecting GOG.' })
    unwrap(await supabase.from('gog_connections').delete().eq('user_id', req.userId))
    attempts.delete(req.userId); jobs.delete(req.userId)
    res.json({ connected: false })
  }))
}
