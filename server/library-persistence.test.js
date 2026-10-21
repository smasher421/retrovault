import assert from 'node:assert/strict'
import { test } from 'node:test'

test('planning is owner scoped, unknown manual playtime stays unknown, and public profiles omit hidden/private data', async () => {
  const originalFetch = globalThis.fetch
  process.env.SUPABASE_URL = 'https://library-test.supabase.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  const owner = '00000000000000001', requests = []
  const catalog = { id: 100, title: 'Console classic', genres: ['Racing'], platforms: ['PSP'], discovery_metadata: { tags: ['Arcade'] } }
  const rows = [
    { id: 1, user_id: owner, catalog_id: 100, catalog, status: 'Backlog', source: 'manual', playtime_minutes: 0, tracking: { priority: 'High', mainHours: 5 }, notes: 'Private note', purchase_price: 12, recent_playtime_minutes: 60, achievements_summary: { completed: 9, total: 10 } },
    { id: 2, user_id: owner, catalog_id: 100, catalog, status: 'Completed', source: 'steam', playtime_minutes: 10000, tracking: { hidden: 'Yes' } },
  ]
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    assert.equal(url.hostname, 'library-test.supabase.invalid')
    requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null })
    if (url.pathname.endsWith('/profiles')) return Response.json({ steam_id: owner, username: 'Player', is_public: true })
    if (init?.method === 'PATCH') return Response.json(rows[0])
    return Response.json(rows)
  }
  try {
    const db = await import('./supabase.js')
    const library = await db.getUserGames(owner)
    assert.equal(library[0].playtime_available, false)
    assert.equal(library[0].tracking.priority, 'High')
    await db.updateUserGame(1, owner, { tracking: { priority: 'Medium', progress: 40 }, user_id: 'someone-else' })
    const write = requests.at(-1)
    assert.equal(write.url.searchParams.get('user_id'), `eq.${owner}`)
    assert.equal(write.url.searchParams.get('id'), 'eq.1')
    assert.equal(write.body.user_id, undefined)
    assert.deepEqual(write.body.tracking, { priority: 'Medium', progress: 40 })
    const profile = await db.getPublicProfileSummary(owner)
    assert.equal(profile.games.length, 1)
    assert.equal(profile.stats.total, 1)
    assert.equal(profile.stats.playtimeMinutes, 0)
    for (const field of ['tracking', 'notes', 'purchase_price', 'achievements_summary', 'recent_playtime_minutes']) assert.equal(Object.hasOwn(profile.games[0], field), false)
    await db.saveAchievementSummary(1, owner, { total: 2, completed: 2, source: 'Steam', achievements: [{ achieved: true, unlockedAt: '2026-10-01T12:00:00Z' }, { achieved: true, unlockedAt: '2026-10-03T12:00:00Z' }] })
    assert.equal(requests.at(-1).body.achievements_summary.completedAt, '2026-10-03T12:00:00Z')
    assert.equal(requests.at(-1).url.searchParams.get('user_id'), `eq.${owner}`)
  } finally { globalThis.fetch = originalFetch }
})
