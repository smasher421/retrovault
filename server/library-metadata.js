const plain = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const json = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error(`Game metadata provider returned HTTP ${response.status}.`)
  return response.json()
}
const settledValue = (result) => result.status === 'fulfilled' ? result.value : null
export function steamMetadata(details, reviews, deck, html = '') {
  const metadata = { provider: 'Steam', updatedAt: new Date().toISOString() }
  if (details) {
    metadata.genres = (details.genres || []).map((genre) => genre.description)
    metadata.developer = (details.developers || []).join(', ')
    metadata.publisher = (details.publishers || []).join(', ')
    const year = details.release_date?.date?.match(/\b(19\d{2}|20\d{2})\b/)?.[1]
    if (year) metadata.year = Number(year)
    if (Number.isFinite(details.metacritic?.score)) metadata.metacritic = details.metacritic.score
    const features = (details.categories || []).map((item) => item.description)
    metadata.features = features
    metadata.os = Object.entries(details.platforms || {}).filter(([, supported]) => supported).map(([os]) => ({ windows: 'Windows', linux: 'Linux', mac: 'macOS' })[os]).filter(Boolean)
    metadata.gameType = details.type
    if (typeof details.is_free === 'boolean') metadata.free = details.is_free ? 'Free' : 'Paid'
    // Absence in a successful store feature list means the store does not list support.
    for (const [key, feature] of [['cloud', 'Steam Cloud'], ['workshop', 'Steam Workshop']]) metadata[key] = features.includes(feature) ? 'Yes' : 'No'
    metadata.controller = details.controller_support === 'full' ? 'Full' : details.controller_support === 'partial' ? 'Partial' : 'None'
    const remotePlay = features.filter((feature) => /^Remote Play (Together|on TV|on Phone)$/.test(feature))
    metadata.remotePlay = remotePlay.length ? remotePlay : 'None'
    metadata.vr = features.includes('VR Only') ? 'VR Only' : features.includes('VR Supported') ? 'VR Supported' : 'Non-VR'
    if (features.some((feature) => /HDR/i.test(feature))) metadata.hdr = 'Yes'
    if (metadata.workshop === 'Yes') metadata.modSupport = 'Steam Workshop'
    const modes = []
    if (features.includes('Single-player')) modes.push('Singleplayer')
    if (features.some((feature) => /multi-player/i.test(feature))) modes.push('Multiplayer')
    if (features.some((feature) => /co-op/i.test(feature))) modes.push('Co-op')
    if (features.some((feature) => /pvp/i.test(feature))) modes.push('PvP')
    metadata.mode = modes
    metadata.multiplayerType = [['Online', /online pvp|online co-op/i], ['LAN', /lan /i], ['Local', /shared\/split screen/i], ['Split-Screen', /split screen/i]].filter(([, pattern]) => features.some((feature) => pattern.test(feature))).map(([name]) => name)
    metadata.coopType = [['Online Co-op', /online co-op/i], ['Couch Co-op', /shared\/split screen co-op/i]].filter(([, pattern]) => features.some((feature) => pattern.test(feature))).map(([name]) => name)
    if (details.achievements && Number.isInteger(details.achievements.total)) metadata.achievementCount = details.achievements.total
    if (details.supported_languages) metadata.languages = plain(details.supported_languages).split(',').map((language) => language.replace(/\*.*$/, '').trim()).filter(Boolean)
    if (details.required_age !== undefined) metadata.requiredAge = details.required_age
  }
  const tags = [...html.matchAll(/<a\b[^>]*class=["'][^"']*\bapp_tag\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => plain(match[1])).filter((tag) => tag && tag !== '+')
  if (tags.length) metadata.tags = [...new Set(tags)].slice(0, 40)
  if (reviews?.success === 1 && reviews.query_summary) {
    const stats = reviews.query_summary
    metadata.reviewCount = Number(stats.total_reviews)
    metadata.sentiment = stats.review_score_desc
    if (stats.total_reviews > 0) metadata.positivePercent = Math.round(stats.total_positive / stats.total_reviews * 10000) / 100
  }
  if (deck?.success === 1) metadata.deck = ['Unknown', 'Unsupported', 'Playable', 'Verified'][deck.results?.resolved_category] || 'Unknown'
  return metadata
}
export async function fetchLibraryMetadata(game) {
  const previous = game.discovery_metadata || {}
  if (previous.updatedAt && Date.now() - Date.parse(previous.updatedAt) < (previous.incomplete ? 3600000 : 7 * 86400000)) return previous
  if (game.steam_app_id) {
    const id = game.steam_app_id
    const results = await Promise.allSettled([
      json(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english&cc=ro`),
      json(`https://store.steampowered.com/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0`),
      json(`https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=${id}`),
      fetch(`https://store.steampowered.com/app/${id}/?l=english`, { signal: AbortSignal.timeout(9000) }).then((response) => { if (!response.ok) throw new Error('Steam tags unavailable'); return response.text() }),
    ])
    const [store, reviews, deck, html] = results.map(settledValue)
    const details = store?.[id]?.success ? store[id].data : null
    if (!details && reviews?.success !== 1 && deck?.success !== 1) throw new Error('Steam metadata is temporarily unavailable. Existing data was kept.')
    const metadata = { ...previous, ...steamMetadata(details, reviews, deck, html || '') }
    metadata.incomplete = results.some((result) => result.status === 'rejected') || !details || !metadata.tags?.length
    // Partial results get a shorter cache to avoid hammering rate-limited providers.
    return metadata
  }
  if (game.rawg_id && process.env.RAWG_API_KEY) {
    const result = await json(`https://api.rawg.io/api/games/${game.rawg_id}?key=${encodeURIComponent(process.env.RAWG_API_KEY)}`)
    return { ...previous, provider: 'RAWG', updatedAt: new Date().toISOString(), tags: (result.tags || []).filter((tag) => !tag.language || tag.language === 'eng').map((tag) => tag.name), platforms: (result.platforms || []).map((entry) => entry.platform.name) }
  }
  throw new Error('No automatic metadata provider for this game. Add personal tags and compatibility in Planning & progress.')
}

export async function fetchCompletionEstimate(id) {
  const response = await fetch(`https://howlongtobeat.com/game/${id}`, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`HowLongToBeat returned HTTP ${response.status}. Enter the estimates manually and keep the source link.`)
  const html = await response.text()
  const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) throw new Error('HowLongToBeat did not provide readable estimates. Enter them manually.')
  const data = JSON.parse(match[1]).props?.pageProps?.game
  const game = Array.isArray(data) ? data[0] : data
  if (!game?.game_name) throw new Error('No completion estimates found on this page.')
  const estimates = Object.fromEntries([['mainHours', 'comp_main'], ['extraHours', 'comp_plus'], ['completeHours', 'comp_100']].filter(([, field]) => Number(game[field]) > 0).map(([key, field]) => [key, Math.round(Number(game[field]) / 36) / 100]))
  if (!Object.keys(estimates).length) throw new Error('This title has no published completion estimates.')
  return { title: game.game_name, ...estimates, estimateSource: `https://howlongtobeat.com/game/${id}` }
}

export function registerLibraryRoutes(app, { requireUser, appOrigin, getOwnedGames, updateCatalogDetails, fetchAchievements, saveAchievementSummary, fetchMetadata = fetchLibraryMetadata }) {
  app.post('/api/library/refresh', requireUser, async (req, res) => {
    if (req.get('origin') && req.get('origin') !== new URL(appOrigin(req)).origin) return res.status(403).json({ message: 'Use RetroVault to refresh your library.' })
    const { ids, mode = 'metadata' } = req.body || {}
    if (!Array.isArray(ids) || !ids.length || ids.length > 4 || ids.some((id) => !/^\d{1,20}$/.test(String(id))) || !['metadata', 'achievements'].includes(mode)) return res.status(400).json({ message: 'Choose 1–4 library games and a supported refresh mode.' })
    try {
      const requested = [...new Set(ids.map(String))]
      const games = await getOwnedGames(req.userId, requested)
      if (games.length !== requested.length) return res.status(404).json({ message: 'One or more games are not in your library.' })
      const results = await Promise.all(games.map(async (game) => {
        try {
          if (mode === 'metadata') {
            const metadata = await fetchMetadata(game)
            const catalog = { discovery_metadata: metadata }
            if (metadata.genres?.length) catalog.genres = metadata.genres
            if (metadata.developer) catalog.developer = metadata.developer
            if (metadata.publisher) catalog.publisher = metadata.publisher
            if (metadata.year) catalog.release_year = metadata.year
            if (metadata.metacritic != null) catalog.metacritic_score = metadata.metacritic
            await updateCatalogDetails(game.catalog_id, catalog)
            const libraryFields = {
              ...(metadata.genres?.length ? { genres: metadata.genres } : {}),
              ...(metadata.developer ? { developer: metadata.developer } : {}),
              ...(metadata.publisher ? { publisher: metadata.publisher } : {}),
              ...(metadata.year ? { year: metadata.year } : {}),
              ...(metadata.metacritic != null ? { metacritic_score: metadata.metacritic } : {}),
            }
            return { id: game.id, discovery_metadata: metadata, library_fields: libraryFields, warning: metadata.incomplete ? 'Some Steam fields are unavailable; refresh again later.' : null }
          }
          if (!game.steam_app_id) throw new Error('Automatic achievement refresh is available for Steam games.')
          const summary = await fetchAchievements(req.userId, String(game.steam_app_id))
          const record = await saveAchievementSummary(game.id, req.userId, summary)
          return { id: game.id, achievements_summary: record }
        } catch (error) { return { id: game.id, error: error.message } }
      }))
      res.json({ results })
    } catch (error) { res.status(502).json({ message: error.message }) }
  })
  app.get('/api/library/estimates/:id', requireUser, async (req, res) => {
    if (!/^\d{1,10}$/.test(req.params.id)) return res.status(400).json({ message: 'Enter a valid HowLongToBeat game ID.' })
    try { res.json(await fetchCompletionEstimate(req.params.id)) }
    catch (error) { res.status(502).json({ message: error.message }) }
  })
}
