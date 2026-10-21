import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_LIBRARY_FILTERS, backlogCandidates, filterLibrary, gameAttribute, libraryFilterError, parseLibraryQuery, validateSavedSearches } from '../shared/library-filters.js'
import { validateTracking } from '../shared/library-schema.js'

const game = (id, overrides = {}) => ({ id, title: `Game ${id}`, status: 'Backlog', platform: 'Steam', source: 'steam', genres: ['RPG'], playtime_minutes: 0, playtime_available: true, year: 2005, created_at: '2026-10-01T12:00:00Z', tracking: {}, ...overrides })
const match = (games, filters) => filterLibrary(games, { ...DEFAULT_LIBRARY_FILTERS, ...filters }, { now: new Date('2026-10-21T12:00:00Z') }).map((entry) => entry.id)

test('playtime boundaries exclude unavailable values and honor custom comparisons', () => {
  const games = [game(1), game(2, { playtime_minutes: 119 }), game(3, { playtime_minutes: 120 }), game(4, { playtime_available: false }), game(5, { tracking: { playedHours: 2 } })]
  assert.deepEqual(match(games, { playtimeRange: 'under2' }), [1, 2])
  assert.deepEqual(match(games, { playtime: '2..10' }), [3, 5])
  assert.deepEqual(match(games, { playtime: 'unknown' }), [4])
  assert.deepEqual(match(games, { playtimeRange: 'zero' }), [1])
  assert.match(libraryFilterError({ playtime: '20..2' }), /Minimum/)
})
test('quoted tags, negative operators, status aliases, OS and numeric scores combine', () => {
  const games = [game(1, { discovery_metadata: { tags: ['Open World'], os: ['Windows'], positivePercent: 95 } }), game(2, { discovery_metadata: { tags: ['Open World', 'Multiplayer'], os: ['Windows'], positivePercent: 95 } }), game(3)]
  assert.deepEqual(match(games, { query: 'genre:rpg status:unplayed tag:"Open World" -tag:"Multiplayer" platform:windows year:2000..2010 rating:>=90' }), [1])
  assert.deepEqual(match(games, { query: '"Game 2"' }), [2])
  assert.throws(() => parseLibraryQuery('tag:"Open World'), /Close/)
  assert.match(libraryFilterError({ query: 'surprise:yes' }), /Unknown search operator/)
  assert.match(libraryFilterError({ query: 'sort:wrong' }), /supported sort/)
  assert.deepEqual(match([game(4, { title: 'Half-Life: Alyx' })], { query: 'Half-Life: Alyx' }), [4])
  assert.match(libraryFilterError({ query: 'estimateType:extraHours' }), /dropdown/)
})
test('all smart collections use recorded facts; campaign and achievements stay separate', () => {
  const games = [game(1, { tracking: { mainHours: 4, progress: 20 }, discovery_metadata: { mode: ['Singleplayer'], positivePercent: 92, reviewCount: 500 }, achievements_summary: { total: 10, completed: 9 } }), game(2, { playtime_minutes: 100, last_played_at: '2024-01-01T12:00:00Z' }), game(3, { status: 'Completed', tracking: { mainHours: 2, progress: 100 }, achievements_summary: { total: 10, completed: 3 } }), game(4, { playtime_available: false })]
  assert.deepEqual(match(games, { collection: 'unplayed' }), [1])
  assert.deepEqual(match(games, { collection: 'weekend' }), [1])
  assert.deepEqual(match(games, { collection: 'almost' }), [1])
  assert.deepEqual(match(games, { collection: 'gems' }), [1])
  assert.deepEqual(match(games, { collection: 'tonight' }), [1])
  assert.deepEqual(match(games, { collection: 'forgotten' }), [2])
  assert.equal(gameAttribute(games[0], 'remainingHours'), 3.2)
  assert.equal(gameAttribute(games[2], 'achievements'), 30)
})
test('personal overrides, inferred tags, unknown compatibility and hidden records', () => {
  const games = [game(1, { discovery_metadata: { tags: ['Horror', 'Open World'], controller: 'Full' }, tracking: { mood: 'Relaxing', hdr: 'Yes', personalTags: ['My shortlist'] } }), game(2, { tracking: { hidden: 'Yes' } }), game(3)]
  assert.deepEqual(match(games, {}), [1, 3])
  assert.deepEqual(match(games, { hidden: 'Only hidden' }), [2])
  assert.deepEqual(match(games, { mood: 'Relaxing', world: 'Open World', controller: 'Full', tag: 'My shortlist', hdr: 'Yes' }), [1])
  assert.deepEqual(match(games, { mood: 'Scary' }), [])
  assert.deepEqual(match(games, { hdr: 'No' }), [])
  assert.deepEqual(match(games, { hdr: 'unknown' }), [3])
})
test('sorting keeps unknown values last and roulette considers every matching page', () => {
  const games = Array.from({ length: 60 }, (_, index) => game(index + 1, { tracking: { priority: index > 29 ? 'High' : 'Low' } }))
  const ordered = filterLibrary(games, { ...DEFAULT_LIBRARY_FILTERS, priority: 'High', sort: 'title-asc' })
  assert.equal(ordered.length, 30)
  assert.equal(ordered.slice(0, 24).length, 24)
  assert.equal(backlogCandidates(ordered).length, 30)
  assert.equal(backlogCandidates([game(1, { tracking: { backlogState: 'Excluded' } }), game(2, { tracking: { intention: 'Not Interested' } }), game(3)]).length, 1)
  const unknown = [game(1), game(2, { rating: 2 }), game(3, { rating: 9 })]
  assert.deepEqual(match(unknown, { sort: 'myrating-asc' }), [2, 3, 1])
  assert.deepEqual(match(unknown, { sort: 'myrating-desc' }), [3, 2, 1])
  const shuffle = { ...DEFAULT_LIBRARY_FILTERS, sort: 'random' }
  assert.deepEqual(filterLibrary(games, shuffle, { shuffleSeed: 10 }), filterLibrary(games, shuffle, { shuffleSeed: 10 }))
  assert.notDeepEqual(filterLibrary(games, shuffle, { shuffleSeed: 10 }), filterLibrary(games, shuffle, { shuffleSeed: 50 }))
})
test('last played distinguishes never played from unknown activity', () => {
  const games = [game(1), game(2, { playtime_minutes: 10 }), game(3, { playtime_available: false }), game(4, { last_played_at: '2026-10-21T10:00:00Z' })]
  assert.deepEqual(match(games, { lastPlayed: 'never' }), [1])
  assert.deepEqual(match(games, { lastPlayed: 'unknown' }), [2, 3])
  assert.deepEqual(match(games, { lastPlayed: 'today' }), [4])
})
test('campaign completion dates and perfect achievement dates filter independently', () => {
  const games = [game(1, { tracking: { completedAt: '2026-10-01' }, achievements_summary: { total: 10, completed: 10, completedAt: '2025-05-01T12:00:00Z' } }), game(2, { tracking: { completedAt: '2025-05-01' }, achievements_summary: { total: 10, completed: 10, completedAt: '2026-10-01T12:00:00Z' } })]
  assert.deepEqual(match(games, { completedAfter: '2026-10-01', completedBefore: '2026-10-01' }), [1])
  assert.deepEqual(match(games, { achievementCompletedAfter: '2026-10-01' }), [2])
  assert.match(libraryFilterError({ addedAfter: '2026-02-30' }), /valid date/)
})
test('saved searches and personal data validate structure, bounds and private fields', () => {
  const search = { id: 'sample', name: 'Short RPGs', filters: { query: 'genre:rpg hltb:<20h' } }
  assert.equal(validateSavedSearches([search])[0].filters.hidden, 'Hide')
  assert.throws(() => validateSavedSearches([search, search]), /Invalid saved search/)
  assert.throws(() => validateSavedSearches([{ ...search, filters: { user_id: 'someone-else' } }]), /Invalid saved search filter/)
  assert.throws(() => validateSavedSearches(Array(26).fill(search)), /25 searches/)
  assert.throws(() => validateTracking({ user_id: 'someone-else' }), /Unsupported/)
  assert.throws(() => validateTracking({ progress: 101 }), /between/)
  assert.throws(() => validateTracking({ hdr: true }), /Invalid/)
  assert.throws(() => validateTracking({ completedAt: '2026-02-30' }), /valid completion date/)
  assert.deepEqual(validateTracking({ progress: 0, priority: 'High', personalTags: ['Retro', 'Retro'], hdr: '' }), { progress: 0, priority: 'High', personalTags: ['Retro'] })
})
