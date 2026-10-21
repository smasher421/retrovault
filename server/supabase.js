import { REVIEW_VISIBILITIES, isReviewPublic } from '../shared/reviews.js'
import { validateTracking } from '../shared/library-schema.js'
import { validateSavedSearches } from '../shared/library-filters.js'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Server-only client. Keep the service role key out of all Vite/browser variables.
export const supabase = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

const toGame = (row) => {
  const catalog = row.catalog || row.games_catalog || {}
  return {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    catalog_id: row.catalog_id,
    title: catalog.title || 'Untitled game',
    platform: row.platform_played || catalog.platforms?.[0] || 'Unknown',
    genre: catalog.genres?.join(', ') || 'Unknown',
    year: catalog.release_year,
    status: row.status,
    rating: row.rating,
    notes: row.notes || '',
    review_text: row.review_text || '',
    review_visibility: row.review_visibility || 'profile',
    cover_image: catalog.artwork_grid_url || catalog.cover_url || catalog.backdrop_url || '',
    backdrop_url: catalog.artwork_hero_url || catalog.backdrop_url || '',
    artwork_grid_url: catalog.artwork_grid_url || '',
    artwork_hero_url: catalog.artwork_hero_url || '',
    artwork_logo_url: catalog.artwork_logo_url || '',
    metacritic_score: catalog.metacritic_score,
    metacritic_url: catalog.metacritic_url || '',
    screenshots: catalog.screenshots || [],
    summary: (catalog.summary || '').slice(0, 300),
    developer: catalog.developer || '',
    publisher: catalog.publisher || '',
    source: row.source,
    steam_app_id: catalog.steam_app_id,
    gog_product_id: catalog.gog_product_id,
    playtime_available: row.tracking?.playedHours != null || row.source === 'steam' || Boolean(row.playtime_synced_at) || Number(row.playtime_minutes) > 0,
    playtime_minutes: row.tracking?.playedHours != null ? Math.round(row.tracking.playedHours * 60) : row.playtime_minutes || 0,
    last_played_at: row.tracking?.lastSession || row.last_played_at,
    is_favorite: row.is_favorite,
    purchase_price: row.purchase_price,
    time_to_beat_hours: catalog.time_to_beat_hours,
    discovery_metadata: catalog.discovery_metadata || {},
    tracking: row.tracking || {},
    achievements_summary: row.achievements_summary || null,
    recent_playtime_minutes: row.recent_playtime_minutes ?? null,
    genres: catalog.genres || [],
    multiplayer: catalog.multiplayer || false,
    co_op: catalog.co_op || false,
    rawg_id: catalog.rawg_id,
    metadata_provider: catalog.metadata_provider || 'manual',
    rating_avg: catalog.rating_avg || 0,
    rating_count: catalog.rating_count || 0,
  }
}

const catalogRelation = 'catalog:games_catalog(id,title,slug,platforms,release_year,genres,cover_url,backdrop_url,artwork_grid_url,artwork_hero_url,artwork_logo_url,metacritic_score,metacritic_url,screenshots,summary,developer,publisher,steam_app_id,gog_product_id,rawg_id,metadata_provider,rating_avg,rating_count,time_to_beat_hours,multiplayer,co_op,discovery_metadata)'

export const getCatalogGameForUser = async (userId, userGameId) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const { data, error } = await supabase.from('user_games')
    .select('catalog:games_catalog(*)')
    .eq('id', userGameId).eq('user_id', userId).single()
  if (error) throw error
  return data.catalog
}

export const getCatalogGameById = async (catalogId) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const { data, error } = await supabase.from('games_catalog').select('*').eq('id', catalogId).single()
  if (error) throw error
  return data
}

export const updateCatalogDetails = async (catalogId, changes) => {
  const allowedFields = [
    'discovery_metadata', 'metacritic_score', 'metacritic_url', 'screenshots', 'artwork_grid_url',
    'artwork_hero_url', 'artwork_logo_url', 'details_updated_at', 'summary',
    'developer', 'publisher', 'release_year', 'genres', 'platforms', 'backdrop_url', 'cover_url',
    'rawg_id', 'slug', 'metadata_provider', 'metadata_updated_at', 'rating_avg', 'rating_count',
  ]
  const update = Object.fromEntries(Object.entries(changes).filter(([key, value]) => allowedFields.includes(key) && value !== undefined))
  if (!Object.keys(update).length) return null
  update.updated_at = new Date().toISOString()
  const { data, error } = await supabase.from('games_catalog').update(update).eq('id', catalogId).select('*').single()
  if (error) throw error
  return data
}

export const getUserGames = async (userId) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const games = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('user_games').select(`*, ${catalogRelation}`)
      .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499)
    if (error) throw error
    games.push(...(data || []).map(toGame))
    if ((data || []).length < 500) return games
  }
}

export const getUserProfile = async (steamId) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const { data, error } = await supabase.from('profiles').select('*').eq('steam_id', steamId).maybeSingle()
  if (error) throw error
  return data
}

export const upsertSteamProfile = async (steamId, player = {}) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const payload = {
    steam_id: steamId,
    ...(player.personaname ? { username: player.personaname } : {}),
    ...(player.avatarfull ? { avatar_url: player.avatarfull } : {}),
    ...(player.profileurl ? { profile_url: player.profileurl } : {}),
    ...(player.timecreated ? { steam_created_at: new Date(player.timecreated * 1000).toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('profiles').upsert(payload, { onConflict: 'steam_id' }).select().single()
  if (error) throw error
  return data
}

export const updateUserProfile = async (steamId, changes) => {
  const allowed = {}
  if (Object.hasOwn(changes, 'saved_searches')) allowed.saved_searches = validateSavedSearches(changes.saved_searches)
  if (changes.preferred_theme) allowed.preferred_theme = changes.preferred_theme
  if (changes.custom_theme && typeof changes.custom_theme === 'object') allowed.custom_theme = changes.custom_theme
  if (typeof changes.is_public === 'boolean') allowed.is_public = changes.is_public
  if (typeof changes.bio === 'string') allowed.bio = changes.bio.trim().slice(0, 500)
  if (Object.keys(allowed).length === 0) throw new Error('No supported profile settings were supplied')
  allowed.updated_at = new Date().toISOString()
  const { data, error } = await supabase.from('profiles').update(allowed).eq('steam_id', steamId).select().single()
  if (error) throw error
  return data
}

export const getPublicProfile = async (steamId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('steam_id,username,avatar_url,profile_url,steam_created_at,preferred_theme,custom_theme,is_public')
    .eq('steam_id', steamId)
    .eq('is_public', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export const searchCatalog = async (query, limit = 30) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const { data, error } = await supabase
    .from('games_catalog')
    .select('id,catalog_key,steam_app_id,igdb_id,rawg_id,title,slug,release_year,developer,publisher,summary,genres,platforms,cover_url,backdrop_url,time_to_beat_hours,rating_avg,rating_count,co_op,multiplayer,metadata_provider')
    .ilike('title', `%${query.replace(/[%_]/g, '\\$&')}%`)
    .order('rating_count', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export const getCatalogDiscover = async (userId, { platform = '', genre = '', limit = 36 } = {}) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  let request = supabase.from('games_catalog')
    .select('id,catalog_key,steam_app_id,igdb_id,rawg_id,title,slug,release_year,developer,publisher,summary,genres,platforms,cover_url,backdrop_url,artwork_grid_url,artwork_hero_url,rating_avg,rating_count,metacritic_score,co_op,multiplayer,metadata_provider')
    .order('rating_count', { ascending: false }).order('rating_avg', { ascending: false }).limit(Math.min(Math.max(limit, 1), 100))
  if (platform) request = request.contains('platforms', [platform])
  if (genre) request = request.contains('genres', [genre])
  const [{ data: catalog, error: catalogError }, { data: owned, error: ownedError }] = await Promise.all([
    request,
    supabase.from('user_games').select('catalog_id').eq('user_id', userId),
  ])
  if (catalogError) throw catalogError
  if (ownedError) throw ownedError
  const ownedIds = new Set((owned || []).map((game) => game.catalog_id))
  return (catalog || []).filter((game) => !ownedIds.has(game.id))
}

// Filter publication at the database level before counts, ordering, or pagination.
// An empty, filtered profile embed supplies the legacy follow-profile condition.
const reviewQuery = (userId, { catalogId, sort = 'recent', rating = 'all' } = {}, count = false) => {
  let request = supabase.from('user_games').select(`
    id,user_id,catalog_id,rating,review_text,review_visibility,updated_at,
    author:profiles!inner(username,avatar_url,is_public),
    public_author:profiles(),
    game:games_catalog!inner(id,title,release_year,platforms,genres,cover_url,backdrop_url,artwork_grid_url,artwork_hero_url,metacritic_score,rating_avg,rating_count)
  `, count ? { count: 'exact' } : {})
    .not('review_text', 'is', null).neq('review_text', '')
    .eq('public_author.is_public', true)
    .or(`user_id.eq.${userId},review_visibility.eq.public,and(review_visibility.eq.profile,public_author.not.is.null)`)
  if (catalogId) request = request.eq('catalog_id', catalogId)
  if (rating === 'positive') request = request.gte('rating', 7)
  if (rating === 'mixed') request = request.gte('rating', 4).lte('rating', 6)
  if (rating === 'negative') request = request.lte('rating', 3)
  if (rating === 'unrated') request = request.is('rating', null)
  if (sort !== 'recent') request = request.order('rating', { ascending: sort === 'lowest', nullsFirst: false })
  return request.order('updated_at', { ascending: false }).order('id')
}
const formatReview = (review, userId) => ({
  id: review.id, user_id: review.user_id, catalog_id: review.catalog_id,
  rating: review.rating, review_text: review.review_text, review_visibility: review.review_visibility,
  updated_at: review.updated_at, game: review.game,
  author: { username: review.author.username, avatar_url: review.author.avatar_url },
  is_mine: review.user_id === userId,
  is_published: isReviewPublic(review.review_visibility, review.author.is_public),
})

export const getReviewsFeed = async (userId, { catalogId, limit = 40 } = {}) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const { data, error } = await reviewQuery(userId, { catalogId }).limit(Math.min(Math.max(limit, 1), 100))
  if (error) throw error
  return (data || []).map((review) => formatReview(review, userId))
}

export const getReviewsPage = async (userId, { catalogId, page = 1, sort = 'recent', rating = 'all' } = {}) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  const pageSize = 5
  const { data, count, error } = await reviewQuery(userId, { catalogId, sort, rating }, true)
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return {
    reviews: (data || []).map((review) => formatReview(review, userId)),
    total: count || 0, page, page_size: pageSize, total_pages: Math.ceil((count || 0) / pageSize),
  }
}

export const upsertCatalogRows = async (rows, conflict = 'catalog_key') => {
  if (!supabase || rows.length === 0) return []
  const { data, error } = await supabase.from('games_catalog').upsert(rows, { onConflict: conflict }).select()
  if (error) throw error
  return data || []
}

export const getSteamCatalogNeedingEnrichment = async (steamAppIds) => {
  if (!supabase || steamAppIds.length === 0) return []
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.from('games_catalog')
    .select('steam_app_id,release_year,genres,metadata_updated_at')
    .in('steam_app_id', steamAppIds)
  if (error) throw error
  return (data || []).filter((game) => {
    const stale = !game.metadata_updated_at || game.metadata_updated_at < cutoff
    return stale && (!game.release_year || game.genres.length === 0)
  })
}

export const updateSteamCatalogMetadata = async (steamAppId, details) => {
  const changes = {
    metadata_provider: 'steam-store',
    metadata_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (details.release_year) changes.release_year = details.release_year
  if (details.developer) changes.developer = details.developer
  if (details.publisher) changes.publisher = details.publisher
  if (details.summary) changes.summary = details.summary
  if (details.genres?.length) changes.genres = details.genres
  if (details.backdrop_url) changes.backdrop_url = details.backdrop_url
  if (details.time_to_beat_hours) changes.time_to_beat_hours = details.time_to_beat_hours
  const { error } = await supabase.from('games_catalog').update(changes).eq('steam_app_id', steamAppId)
  if (error) throw error
}

export const addCatalogGame = async (payload, userId) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  let catalog
  if (payload.catalog_id) {
    const { data, error } = await supabase.from('games_catalog').select('*').eq('id', payload.catalog_id).single()
    if (error) throw error
    catalog = data
  } else {
    const title = String(payload.title || '').trim()
    if (!title) throw new Error('Title is required')
    const platform = String(payload.platform || '').trim() || 'Unknown'
    const genres = Array.isArray(payload.genres)
      ? payload.genres
      : String(payload.genre || '').split(',').map((item) => item.trim()).filter(Boolean)
    const manualKey = `manual:${title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}:${platform.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`
    const row = {
      catalog_key: manualKey,
      title,
      slug: title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''),
      release_year: Number(payload.year) || null,
      genres,
      platforms: [platform],
      cover_url: payload.cover_image || null,
      metadata_provider: payload.metadata_provider || 'manual',
      metadata_updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('games_catalog').upsert(row, { onConflict: 'catalog_key' }).select().single()
    if (error) throw error
    catalog = data
  }

  const userGame = {
    user_id: userId,
    catalog_id: catalog.id,
    status: payload.status || 'Backlog',
    platform_played: String(payload.platform || catalog.platforms?.[0] || 'PC'),
    playtime_minutes: Number(payload.playtime_minutes) || 0,
    notes: payload.notes || null,
    review_text: payload.review_text || null,
    rating: payload.rating ? Number(payload.rating) : null,
    is_favorite: Boolean(payload.is_favorite),
    purchase_price: payload.purchase_price ? Number(payload.purchase_price) : null,
    source: payload.source === 'steam' ? 'steam' : 'manual',
  }
  const { data, error } = await supabase.from('user_games').upsert(userGame, { onConflict: 'user_id,catalog_id', ignoreDuplicates: true }).select(`*, ${catalogRelation}`).single()
  if (error) throw error
  if (data) return toGame(data)
  const { data: existing, error: readError } = await supabase
    .from('user_games').select(`*, ${catalogRelation}`)
    .eq('user_id', userId).eq('catalog_id', catalog.id).single()
  if (readError) throw readError
  return toGame(existing)
}

export const updateUserGameStatus = async (id, userId, status) => {
  const { data, error } = await supabase.from('user_games').update({ status, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId).select(`*, ${catalogRelation}`).single()
  if (error) throw error
  return toGame(data)
}

export const updateUserGame = async (id, userId, changes) => {
  const allowed = {}
  if (Object.hasOwn(changes, 'review_visibility')) {
    if (!REVIEW_VISIBILITIES.some(([value]) => value === changes.review_visibility)) throw new Error('Choose a supported review visibility.')
    allowed.review_visibility = changes.review_visibility
  }
  if (Object.hasOwn(changes, 'tracking')) allowed.tracking = validateTracking(changes.tracking)
  for (const field of ['rating', 'is_favorite', 'notes', 'review_text', 'purchase_price', 'platform_played']) {
    if (Object.hasOwn(changes, field)) allowed[field] = changes[field]
  }
  if (Object.keys(allowed).length === 0) throw new Error('No supported game fields were supplied')
  allowed.updated_at = new Date().toISOString()
  const { data, error } = await supabase.from('user_games').update(allowed)
    .eq('id', id).eq('user_id', userId).select(`*, ${catalogRelation}`).single()
  if (error) throw error
  return toGame(data)
}

export const deleteUserGame = async (id, userId) => {
  const { data, error } = await supabase.from('user_games').delete().eq('id', id).eq('user_id', userId).select('id').single()
  if (error) throw error
  return data
}

export const syncSteamGames = async (userId, steamGames) => {
  if (!supabase) throw new Error('Supabase server configuration is missing')
  if (!steamGames.length) return { games: [], imported: 0, playLogs: 0 }

  const ids = steamGames.map((game) => game.appid)
  const { data: existingCatalog, error: catalogError } = await supabase.from('games_catalog')
    .select('id,steam_app_id,title,genres,release_year,cover_url,metadata_provider')
    .in('steam_app_id', ids)
  if (catalogError) throw catalogError
  const catalogByApp = new Map((existingCatalog || []).map((game) => [game.steam_app_id, game]))

  const catalogRows = steamGames.map((game) => {
    const existing = catalogByApp.get(game.appid)
    const appId = Number(game.appid)
    const appName = game.name || existing?.title || `Steam app ${appId}`
    const slug = appName.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
    return {
      catalog_key: `steam:${appId}`,
      steam_app_id: appId,
      title: appName,
      slug: existing?.slug || slug,
      platforms: ['PC'],
      genres: existing?.genres?.length ? existing.genres : [],
      release_year: existing?.release_year || null,
      cover_url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`,
      backdrop_url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
      metadata_provider: existing?.metadata_provider && existing.metadata_provider !== 'legacy' ? existing.metadata_provider : 'steam',
    }
  })
  const { data: catalogs, error: upsertCatalogError } = await supabase.from('games_catalog')
    .upsert(catalogRows, { onConflict: 'steam_app_id' }).select('id,steam_app_id,title')
  if (upsertCatalogError) throw upsertCatalogError
  const catalogIdByApp = new Map((catalogs || []).map((game) => [game.steam_app_id, game.id]))

  const catalogIds = steamGames.map((game) => catalogIdByApp.get(game.appid)).filter(Boolean)
  const { data: existingUserGames, error: userGamesError } = await supabase.from('user_games')
    .select('id,catalog_id,status,playtime_minutes')
    .eq('user_id', userId).in('catalog_id', catalogIds)
  if (userGamesError) throw userGamesError
  const existingByCatalog = new Map((existingUserGames || []).map((game) => [game.catalog_id, game]))

  const userRows = steamGames.map((game) => {
    const catalogId = catalogIdByApp.get(game.appid)
    const existing = existingByCatalog.get(catalogId)
    const totalMinutes = Math.max(0, Number(game.playtime_forever) || 0)
    return {
      user_id: userId,
      catalog_id: catalogId,
      status: existing?.status || (totalMinutes > 0 ? 'Playing' : 'Backlog'),
      platform_played: 'Steam',
      playtime_minutes: totalMinutes,
      recent_playtime_minutes: Math.max(0, Number(game.playtime_2weeks) || 0),
      last_played_at: game.rtime_last_played ? new Date(game.rtime_last_played * 1000).toISOString() : null,
      source: 'steam',
    }
  })
  const { data: savedRows, error: saveError } = await supabase.from('user_games')
    .upsert(userRows, { onConflict: 'user_id,catalog_id' }).select('id,catalog_id,playtime_minutes')
  if (saveError) throw saveError
  const savedByCatalog = new Map((savedRows || []).map((game) => [game.catalog_id, game]))

  const playLogs = userRows.flatMap((row) => {
    const previous = existingByCatalog.get(row.catalog_id)
    const next = savedByCatalog.get(row.catalog_id)
    const delta = row.playtime_minutes - (previous?.playtime_minutes || 0)
    if (delta <= 0 || !next) return []
    const steamGame = steamGames.find((game) => catalogIdByApp.get(game.appid) === row.catalog_id)
    return [{
      user_id: userId,
      user_game_id: next.id,
      catalog_id: row.catalog_id,
      happened_at: steamGame?.rtime_last_played ? new Date(steamGame.rtime_last_played * 1000).toISOString() : new Date().toISOString(),
      source: 'steam',
      delta_minutes: delta,
      total_playtime_minutes: row.playtime_minutes,
    }]
  })
  if (playLogs.length) {
    const { error: logsError } = await supabase.from('play_logs')
      .upsert(playLogs, { onConflict: 'user_game_id,total_playtime_minutes', ignoreDuplicates: true })
    if (logsError) throw logsError
  }

  const games = await getUserGames(userId)
  return { games, imported: savedRows?.length || 0, playLogs: playLogs.length }
}

export const getUserPlayLogs = async (userId, limit = 100) => {
  const { data, error } = await supabase.from('play_logs')
    .select(`*, catalog:games_catalog(title,cover_url,steam_app_id)`)
    .eq('user_id', userId)
    .order('happened_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export const getPublicProfileGames = async (steamId, limit = 12) => {
  const { data, error } = await supabase.from('user_games')
    .select(`*, ${catalogRelation}`)
    .eq('user_id', steamId)
    .eq('is_favorite', true)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map(toGame)
}

export const getUserGamesWithCatalog = async (userId) => {
  const { data, error } = await supabase.from('user_games')
    .select(`*, catalog:games_catalog(*)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toGame)
}

export const getPublicProfileSummary = async (steamId) => {
  const profile = await getPublicProfile(steamId)
  if (!profile) return null
  const { data, error } = await supabase.from('user_games')
    .select(`*, catalog:games_catalog(*)`)
    .eq('user_id', steamId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const games = (data || []).map(toGame).filter((game) => game.tracking.hidden !== 'Yes')
  const completed = games.filter((game) => ['Completed', '100% Completed'].includes(game.status)).length
  const privateFields = new Set(['notes', 'review_text', 'review_visibility', 'purchase_price', 'source', 'tracking', 'achievements_summary', 'recent_playtime_minutes'])
  const publicGames = games.map((game) => Object.fromEntries(Object.entries(game).filter(([key]) => !privateFields.has(key))))
  return {
    profile: { steam_id: profile.steam_id, username: profile.username, avatar_url: profile.avatar_url, profile_url: profile.profile_url, steam_created_at: profile.steam_created_at, is_public: profile.is_public },
    games: publicGames,
    stats: {
      total: games.length,
      completed,
      completionRate: games.length ? Math.round(completed / games.length * 100) : 0,
      playtimeMinutes: games.reduce((total, game) => total + game.playtime_minutes, 0),
    },
  }
}

export const getLanMatches = async (userId, friendSteamId) => {
  const [mine, theirs] = await Promise.all([
    supabase.from('user_games').select('status,catalog_id').eq('user_id', userId).in('status', ['Backlog', 'Playing']),
    supabase.from('user_games').select('status,catalog_id').eq('user_id', friendSteamId).in('status', ['Backlog', 'Playing']),
  ])
  if (mine.error) throw mine.error
  if (theirs.error) throw theirs.error
  const sharedIds = [...new Set((mine.data || []).map((game) => game.catalog_id))]
    .filter((id) => (theirs.data || []).some((game) => game.catalog_id === id))
  if (!sharedIds.length) return []
  const { data, error } = await supabase.from('games_catalog')
    .select('id,title,slug,cover_url,genres,platforms,co_op,multiplayer')
    .in('id', sharedIds)
    .or('co_op.eq.true,multiplayer.eq.true')
    .order('title')
  if (error) throw error
  return data || []
}

export const saveAchievementSummary = async (id, userId, summary) => {
  const unlockDates = (summary.achievements || []).filter((achievement) => achievement.achieved && achievement.unlockedAt).map((achievement) => achievement.unlockedAt).sort()
  const record = { completed: summary.completed, total: summary.total, source: summary.source, updatedAt: new Date().toISOString(), completedAt: summary.total > 0 && summary.completed === summary.total && unlockDates.length === summary.total ? unlockDates.at(-1) : null }
  const { error } = await supabase.from('user_games').update({ achievements_summary: record }).eq('id', id).eq('user_id', userId)
  if (error) throw error
  return record
}

export const getOwnedLibraryBatch = async (userId, ids) => {
  const { data, error } = await supabase.from('user_games').select(`*, ${catalogRelation}`).eq('user_id', userId).in('id', ids)
  if (error) throw error
  return (data || []).map(toGame)
}
