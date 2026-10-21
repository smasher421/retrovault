import { GAME_STATUSES, TRACKING_GROUPS } from './library-schema.js'

const select = (key, label, options = []) => ({ key, label, type: 'select', options })
const number = (key, label) => ({ key, label, type: 'number' })
const text = (key, label, type = 'text') => ({ key, label, type })
export const PLAYTIME_RANGES = [
  ['zero', '0h / never played', 0, 0], ['under1', 'Under 1h', 0, 1], ['under2', 'Under 2h', 0, 2],
  ['1to5', '1-5h', 1, 5], ['2to10', '2-10h', 2, 10], ['5to10', '5-10h', 5, 10],
  ['10to25', '10-25h', 10, 25], ['10to50', '10-50h', 10, 50], ['25to50', '25-50h', 25, 50],
  ['50to100', '50-100h', 50, 100], ['50plus', '50h+', 50, Infinity], ['100plus', '100h+', 100, Infinity],
  ['unknown', 'Playtime unavailable'],
]
export const FILTER_GROUPS = [
  { name: 'Library & release', fields: [
    select('status', 'Status', GAME_STATUSES), text('genre', 'Genre', 'facet'), text('tag', 'Steam / personal tag', 'facet'),
    text('platform', 'Platform', 'facet'), select('os', 'Operating system', ['Windows', 'Linux', 'macOS']),
    select('source', 'Library source', ['steam', 'gog', 'manual']), text('developer', 'Developer', 'facet'),
    text('publisher', 'Publisher', 'facet'), text('franchise', 'Franchise', 'facet'),
    select('gameType', 'Game type', ['game', 'dlc', 'demo', 'music', 'video']), select('free', 'Price model', ['Free', 'Paid']),
    number('year', 'Release year'), text('decade', 'Release decade', 'facet'),
    select('favorites', 'Favorites', ['Yes', 'No']), select('hidden', 'Hidden games', ['Hide', 'Show all', 'Only hidden']),
    select('unfinished', 'Started but unfinished', ['Yes', 'No']),
    text('addedAfter', 'Added from', 'date'), text('addedBefore', 'Added until', 'date'),
  ] },
  { name: 'Playtime & activity', fields: [
    select('playtimeRange', 'Total playtime', PLAYTIME_RANGES.map(([id, label]) => [id, label])),
    number('playtime', 'Total hours (custom)'),
    select('lastPlayed', 'Last played', [['never', 'Never'], ['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days'], ['year', 'Last year'], ['over-year', 'Over a year ago'], ['unknown', 'Unknown']]),
    number('recentHours', 'Hours in last 2 weeks'), number('estimated', 'Estimated completion (hours)'),
    select('estimateType', 'Estimate used', [['mainHours', 'Main story'], ['extraHours', 'Main + extras'], ['completeHours', 'Completionist']]),
    number('remainingHours', 'Hours remaining'),
  ] },
  ...TRACKING_GROUPS.map((group) => ({ ...group, fields: group.fields.filter((field) => !['hidden', 'franchise', 'mainHours', 'extraHours', 'completeHours', 'estimateSource', 'remainingHours', 'personalTags', 'playedHours', 'lastSession'].includes(field.key)).map((field) => ({ ...field, type: field.type === 'list' ? 'text' : field.type, options: field.options })) })),
  { name: 'Achievements & ratings', fields: [
    number('achievements', 'Achievement progress (%)'), number('achievementCount', 'Achievement count'), number('achievementRemaining', 'Achievements remaining'),
    text('completedAfter', 'Campaign completed from', 'date'), text('completedBefore', 'Campaign completed until', 'date'),
    text('achievementCompletedAfter', 'Perfect achievements from', 'date'), text('achievementCompletedBefore', 'Perfect achievements until', 'date'),
    select('perfect', 'All achievements unlocked', ['Yes', 'No']), select('hasAchievements', 'Has achievements', ['Yes', 'No']),
    number('rating', 'Steam positive reviews (%)'), number('reviewCount', 'Steam review count'),
    text('sentiment', 'Steam review sentiment', 'facet'), number('metacritic', 'Metacritic (0-100)'),
    number('myrating', 'My rating (1-10)'), select('reviewed', 'My rating available', ['Yes', 'No']),
    select('popularity', 'Steam popularity', ['High', 'Medium', 'Low']),
  ] },
]
export const FILTER_FIELDS = FILTER_GROUPS.flatMap((group) => group.fields)
export const LIBRARY_SORTS = [
  ...[['added', 'Date added'], ['title', 'Title'], ['playtime', 'Playtime'], ['lastPlayed', 'Last played'], ['year', 'Release year'], ['rating', 'Steam positive %'], ['metacritic', 'Metacritic'], ['estimated', 'Completion time'], ['achievements', 'Achievement progress'], ['myrating', 'My rating'], ['priority', 'Priority'], ['storageGb', 'Storage size']]
    .flatMap(([key, label]) => [[`${key}-asc`, `${label} (ascending)`], [`${key}-desc`, `${label} (descending)`]]), ['random', 'Shuffle'],
]
export const DEFAULT_LIBRARY_FILTERS = Object.freeze({ ...Object.fromEntries(FILTER_FIELDS.map(({ key }) => [key, ''])), hidden: 'Hide', estimateType: 'mainHours', query: '', collection: '', sort: 'added-desc' })
export const SMART_COLLECTIONS = [
  { id: 'unplayed', name: 'Unplayed', description: 'Backlog games with exactly 0 recorded minutes.' },
  { id: 'weekend', name: 'Finish in a weekend', description: 'Unfinished games with a known estimate under 8 hours.' },
  { id: 'almost', name: 'Almost 100%', description: '80-99% of achievements unlocked; campaign progress stays separate.' },
  { id: 'gems', name: 'Hidden gems', description: 'At least 80% positive Steam reviews, 50+ reviews, and under 2 hours played.' },
  { id: 'tonight', name: 'Tonight pick', description: 'Unfinished singleplayer games with a known estimate under 5 hours.' },
  { id: 'forgotten', name: 'Forgotten games', description: 'Started, unfinished, and last played more than a year ago.' },
]
export const normalize = (value) => String(value ?? '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const num = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const date = (value) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const same = (a, b) => normalize(a) === normalize(b)
export const recordedMinutes = (game) => num(game.tracking?.playedHours) !== null ? game.tracking.playedHours * 60 : game.playtime_available === false ? null : num(game.playtime_minutes)
export const gameGenres = (game) => (game.genres?.length ? game.genres : [game.genre || '']).flatMap((item) => item.split(',')).map((item) => item.trim()).filter((item) => item && !['unknown', 'unclassified'].includes(normalize(item)))
const unfinished = (game) => !['Completed', '100% Completed', 'Abandoned'].includes(game.status)
const yesNo = (value) => value === true ? 'Yes' : value === false ? 'No' : value
const tagAliases = { 'First Person': ['First-Person', 'FPS'], 'Third Person': ['Third Person', 'Third-Person'], 'Co-op': ['Co-op', 'Online Co-Op', 'Local Co-Op'], 'Singleplayer': ['Single-player', 'Singleplayer'], 'Multiplayer': ['Multi-player', 'Multiplayer'], 'Scary': ['Horror', 'Survival Horror'], 'Immersive': ['Immersive Sim'], 'Relaxing': ['Relaxing', 'Cozy'], 'Intense': ['Action', 'Fast-Paced'], 'Retro': ['Retro', '1990s', '1980s'], 'Classic': ['Classic'], 'Replayable': ['Replay Value'], 'Endless': ['Endless'], 'Live Service': ['Live Service'], 'RPG Progression': ['RPG'], 'Non-VR': ['Non-VR'] }

export function gameAttribute(game, key, estimateType = 'mainHours') {
  const tracking = game.tracking || {}, metadata = game.discovery_metadata || {}
  if (Object.hasOwn(tracking, key)) return tracking[key]
  const minutes = recordedMinutes(game)
  const summary = game.achievements_summary
  const total = num(summary?.total ?? metadata.achievementCount)
  const completed = num(summary?.completed)
  const estimates = { ...metadata.estimates, ...tracking }
  const estimate = num(estimates[estimateType] ?? (estimateType === 'mainHours' ? game.time_to_beat_hours : null))
  switch (key) {
    case 'title': return game.title
    case 'genre': return gameGenres(game)
    case 'tag': return [...(metadata.tags || []), ...(tracking.personalTags || [])]
    case 'platform': return [game.platform, ...(metadata.platforms || [])].filter(Boolean)
    case 'os': return metadata.os || []
    case 'source': return game.source
    case 'status': return game.status
    case 'developer': return game.developer?.split(',').map((value) => value.trim()) || []
    case 'publisher': return game.publisher?.split(',').map((value) => value.trim()) || []
    case 'year': return num(game.year)
    case 'decade': return num(game.year) ? `${Math.floor(Number(game.year) / 10) * 10}s` : null
    case 'favorites': return yesNo(Boolean(game.is_favorite))
    case 'hidden': return 'No'
    case 'added': return date(game.created_at)
    case 'lastPlayed': return date(tracking.lastSession || game.last_played_at)
    case 'playtime': return minutes === null ? null : minutes / 60
    case 'recentHours': return num(game.recent_playtime_minutes) === null ? null : game.recent_playtime_minutes / 60
    case 'estimated': return estimate
    case 'remainingHours': return estimate !== null && num(tracking.progress) !== null ? estimate * (1 - tracking.progress / 100) : null
    case 'priority': return 'None'
    case 'backlogState': return game.status === 'Backlog' ? 'In Backlog' : unfinished(game) ? null : 'Cleared'
    case 'achievements': return total > 0 && completed !== null ? completed / total * 100 : null
    case 'achievementCount': return total
    case 'achievementRemaining': return total !== null && completed !== null ? total - completed : null
    case 'hasAchievements': return total === null ? null : yesNo(total > 0)
    case 'perfect': return total > 0 && completed !== null ? yesNo(completed === total) : null
    case 'myrating': return num(game.rating)
    case 'reviewed': return yesNo(num(game.rating) !== null)
    case 'unfinished': return yesNo(unfinished(game) && ((minutes !== null && minutes > 0) || Number(tracking.progress) > 0 || game.status === 'Playing'))
    case 'metacritic': return num(game.metacritic_score)
    case 'rating': return num(metadata.positivePercent)
    case 'reviewCount': return num(metadata.reviewCount)
    case 'popularity': return num(metadata.reviewCount) === null ? null : metadata.reviewCount >= 100000 ? 'High' : metadata.reviewCount >= 10000 ? 'Medium' : 'Low'
    default: break
  }
  if (Object.hasOwn(metadata, key)) return metadata[key]
  const field = FILTER_FIELDS.find((item) => item.key === key)
  const tags = [...(metadata.tags || []), ...(metadata.features || [])]
  if (field?.options) {
    const matches = field.options.filter((option) => (tagAliases[option] || [option]).some((alias) => tags.some((tag) => same(tag, alias))))
    if (matches.length) return matches
  }
  return null
}

export function numericPredicate(expression) {
  const input = String(expression).trim().replace(/%$/, '').replace(/h$/i, '')
  if (same(input, 'unknown')) return (value) => value === null
  const range = input.match(/^(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?)$/)
  if (range) {
    const low = Number(range[1]), high = Number(range[2])
    if (low > high) throw new Error('Minimum must not exceed maximum.')
    return (value) => value !== null && value >= low && value <= high
  }
  const comparison = input.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/)
  if (!comparison) throw new Error('Use a number, <2, >=80, 2..10, or unknown.')
  const target = Number(comparison[2])
  return (value) => value !== null && ({ '>': value > target, '<': value < target, '>=': value >= target, '<=': value <= target, '=': value === target })[comparison[1] || '=']
}
const operatorAliases = { hltb: 'estimated', rating: 'rating', tags: 'tag', myrating: 'myrating' }
const statusAliases = { unplayed: 'Backlog', 'not-started': 'Backlog', dropped: 'Abandoned', completed: 'Completed', playing: 'Playing', paused: 'Paused' }
export function parseLibraryQuery(query) {
  if (query.length > 2000) throw new Error('Search can contain up to 2,000 characters.')
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  if ((query.match(/"/g) || []).length % 2) throw new Error('Close the quoted search value.')
  const terms = [], predicates = []
  let sort = null
  for (let token of tokens) {
    const negative = token.startsWith('-')
    if (negative) token = token.slice(1)
    const colon = token.indexOf(':')
    if (colon === -1) { terms.push({ value: normalize(token.replaceAll('"', '')), negative }); continue }
    const operator = token.slice(0, colon), key = operatorAliases[operator] || operator
    let value = token.slice(colon + 1).replaceAll('"', '')
    if (key !== 'sort' && !FILTER_FIELDS.some((field) => field.key === key) && (!value || /[^a-zA-Z]/.test(operator) || /^[A-Z]/.test(operator))) {
      terms.push({ value: normalize(token.replaceAll('"', '')), negative }); continue
    }
    if (!value) throw new Error(`Enter a value for ${operator}.`)
    if (['estimateType', 'hidden'].includes(key)) throw new Error(`Use the ${key === 'hidden' ? 'Hidden games' : 'Estimate used'} dropdown for this setting.`)
    if (key === 'sort') {
      if (negative || !LIBRARY_SORTS.some(([id]) => id === value)) throw new Error('Choose a supported sort value, e.g. sort:playtime-desc.')
      sort = value; continue
    }
    const field = FILTER_FIELDS.find((item) => item.key === key)
    if (!field) throw new Error(`Unknown search operator: ${operator}.`)
    if (key === 'status') value = statusAliases[normalize(value)] || value
    if (key === 'platform' && ['windows', 'linux', 'macos'].includes(normalize(value))) { predicates.push({ key: 'os', value, negative }); continue }
    if (field.type === 'number') numericPredicate(value)
    predicates.push({ key, value, negative })
  }
  return { terms, predicates, sort }
}

function fieldPredicate(key, value, f, now) {
  if (key === 'hidden') return (game) => value === 'Show all' || (gameAttribute(game, 'hidden') === 'Yes') === (value === 'Only hidden')
  if (key === 'estimateType') return () => true
  if (key === 'playtimeRange') {
    const range = PLAYTIME_RANGES.find(([id]) => id === value)
    if (!range) throw new Error('Choose a supported playtime range.')
    return (game) => {
      const hours = gameAttribute(game, 'playtime')
      return value === 'unknown' ? hours === null : hours !== null && (value === 'zero' ? hours === 0 : hours >= range[2] && hours < range[3])
    }
  }
  if (key === 'lastPlayed') {
    const day = 86400000, nowMs = now.getTime(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const cutoffs = { today, week: nowMs - 7 * day, month: nowMs - 30 * day, year: nowMs - 365 * day }
    if (!['never', 'unknown', 'over-year', ...Object.keys(cutoffs)].includes(value)) throw new Error('Choose a supported last played range.')
    return (game) => {
      const last = date(game.tracking?.lastSession || game.last_played_at), minutes = recordedMinutes(game)
      if (value === 'never') return last === null && minutes === 0
      if (value === 'unknown') return last === null && minutes !== 0
      if (value === 'over-year') return last !== null && last < nowMs - 365 * day
      return last !== null && last >= cutoffs[value] && last <= nowMs
    }
  }
  if (['addedAfter', 'addedBefore', 'completedAfter', 'completedBefore', 'achievementCompletedAfter', 'achievementCompletedBefore'].includes(key)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || date(value) === null || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Enter a valid date.')
    const boundary = new Date(`${value}T00:00:00`)
    if (key.endsWith('Before')) boundary.setDate(boundary.getDate() + 1)
    return (game) => {
      const timestamp = date(key.startsWith('added') ? game.created_at : key.startsWith('achievement') ? game.achievements_summary?.completedAt : game.tracking?.completedAt)
      return timestamp !== null && (key.endsWith('After') ? timestamp >= boundary.getTime() : timestamp < boundary.getTime())
    }
  }
  const field = FILTER_FIELDS.find((item) => item.key === key)
  if (field?.type === 'number') { const matches = numericPredicate(value); return (game) => matches(num(gameAttribute(game, key, f.estimateType))) }
  return (game) => {
    const attribute = gameAttribute(game, key, f.estimateType)
    if (same(value, 'unknown')) return attribute === null || attribute === undefined || attribute === '' || Array.isArray(attribute) && !attribute.length || same(attribute, 'Unknown')
    return (Array.isArray(attribute) ? attribute : [attribute]).some((item) => same(item, value))
  }
}
function compile(filters, now) {
  const parsed = parseLibraryQuery(filters.query || '')
  for (const prefix of ['added', 'completed', 'achievementCompleted']) if (filters[`${prefix}After`] && filters[`${prefix}Before`] && filters[`${prefix}After`] > filters[`${prefix}Before`]) throw new Error('Date range: start must not be after end.')
  const predicates = FILTER_FIELDS.filter(({ key }) => filters[key] !== '' && filters[key] !== undefined).map(({ key }) => fieldPredicate(key, filters[key], filters, now))
  for (const { key, value, negative } of parsed.predicates) {
    const matches = fieldPredicate(key, value, filters, now)
    predicates.push((game) => matches(game) !== negative)
  }
  for (const term of parsed.terms) predicates.push((game) => normalize(game.title).includes(term.value) !== term.negative)
  return { predicates, sort: parsed.sort || filters.sort }
}
export function libraryFilterError(filters) { try { compile({ ...DEFAULT_LIBRARY_FILTERS, ...filters }, new Date()); return '' } catch (error) { return error.message } }
export function libraryFacets(games) {
  return Object.fromEntries(FILTER_FIELDS.filter(({ type }) => type === 'facet').map(({ key }) => [key, [...new Set(games.flatMap((game) => { const value = gameAttribute(game, key); return Array.isArray(value) ? value : [value] }).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))]))
}
const randomRank = (id, seed) => { let hash = seed | 0; for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return hash >>> 0 }
export function filterLibrary(games, filters, { collectionView = 'My Library', now = new Date(), shuffleSeed = 1 } = {}) {
  const f = { ...DEFAULT_LIBRARY_FILTERS, ...filters }
  if (libraryFilterError(f)) return []
  const { predicates, sort } = compile(f, now)
  const result = games.filter((game) => {
    if (collectionView === 'Wishlist' && !game.is_favorite) return false
    if (collectionView === 'New Releases' && !(Number(game.year) >= now.getFullYear() - 1)) return false
    if (collectionView === 'Reviews' && !game.rating && !game.review_text?.trim()) return false
    if (!predicates.every((matches) => matches(game))) return false
    const hours = gameAttribute(game, 'playtime'), estimate = gameAttribute(game, 'estimated', f.estimateType), achievement = gameAttribute(game, 'achievements')
    if (f.collection === 'unplayed') return game.status === 'Backlog' && hours === 0
    if (f.collection === 'weekend') return unfinished(game) && estimate !== null && estimate < 8
    if (f.collection === 'almost') return achievement !== null && achievement >= 80 && achievement < 100
    if (f.collection === 'gems') return hours !== null && hours < 2 && gameAttribute(game, 'rating') >= 80 && gameAttribute(game, 'reviewCount') >= 50
    if (f.collection === 'tonight') return unfinished(game) && estimate !== null && estimate < 5 && fieldPredicate('mode', 'Singleplayer', f, now)(game)
    if (f.collection === 'forgotten') return unfinished(game) && hours > 0 && date(game.tracking?.lastSession || game.last_played_at) !== null && date(game.tracking?.lastSession || game.last_played_at) < now.getTime() - 365 * 86400000
    return true
  })
  const [key, direction] = sort.split('-'), sign = direction === 'desc' ? -1 : 1
  const value = (game) => key === 'random' ? randomRank(game.id, shuffleSeed) : key === 'priority' ? ({ None: 0, Low: 1, Medium: 2, High: 3 })[gameAttribute(game, key)] : gameAttribute(game, key, f.estimateType)
  return result.sort((a, b) => {
    const av = value(a), bv = value(b)
    if (av === null || av === undefined) { if (bv !== null && bv !== undefined) return 1 }
    else if (bv === null || bv === undefined) return -1
    const order = av == null || bv == null ? 0 : typeof av === 'string' ? av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) : av - bv
    return order * sign || a.title.localeCompare(b.title) || String(a.id).localeCompare(String(b.id))
  })
}
export function backlogCandidates(games) { return games.filter((game) => game.status === 'Backlog' && game.tracking?.backlogState !== 'Excluded' && game.tracking?.intention !== 'Not Interested') }
export function libraryFilterChips(filters) {
  return Object.entries(filters).filter(([key, value]) => value !== '' && value !== undefined && key !== 'sort' && value !== DEFAULT_LIBRARY_FILTERS[key]).map(([key, value]) => ({ key, label: `${FILTER_FIELDS.find((item) => item.key === key)?.label || key}: ${SMART_COLLECTIONS.find((item) => item.id === value)?.name || value}` }))
}
export function validateSavedSearches(input) {
  if (!Array.isArray(input) || input.length > 25) throw new Error('Save up to 25 searches.')
  const ids = new Set()
  return input.map((item) => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || !item.filters || typeof item.filters !== 'object' || Array.isArray(item.filters)) throw new Error('Invalid saved search.')
    ids.add(item.id)
    const filters = { ...DEFAULT_LIBRARY_FILTERS }
    for (const [key, value] of Object.entries(item.filters)) {
      if (!Object.hasOwn(filters, key) || typeof value !== 'string' || value.length > (key === 'query' ? 2000 : 200)) throw new Error('Invalid saved search filter.')
      filters[key] = value
    }
    if (!LIBRARY_SORTS.some(([key]) => key === filters.sort) || filters.collection && !SMART_COLLECTIONS.some(({ id }) => id === filters.collection)) throw new Error('Invalid saved search sort or collection.')
    const error = libraryFilterError(filters)
    if (error) throw new Error(error)
    return { id: item.id, name: item.name.trim(), filters }
  })
}
