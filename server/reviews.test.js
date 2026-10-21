import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isReviewPublic } from '../shared/reviews.js'

test('review publication is independent of profile visibility, while legacy reviews retain privacy', () => {
  assert.equal(isReviewPublic('public', false), true)
  assert.equal(isReviewPublic('private', true), false)
  assert.equal(isReviewPublic('profile', false), false)
  assert.equal(isReviewPublic('profile', true), true)
  assert.equal(isReviewPublic('invalid', true), false)
})

test('feed and pagination share publication filters, owners keep drafts, and updates cannot change another account', async () => {
  const originalFetch = globalThis.fetch
  process.env.SUPABASE_URL = 'https://reviews-test.supabase.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  const owner = '00000000000000001', other = '00000000000000002'
  const rows = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1, user_id: index < 2 ? owner : other, catalog_id: 37,
    review_visibility: ['private', 'profile', 'public', 'private', 'profile', 'profile', 'public', 'public'][index],
    rating: 8, review_text: `Fixture review ${index + 1}`, updated_at: '2026-10-21T12:00:00Z',
    author: { username: 'Fixture author', avatar_url: null, is_public: index === 3 || index === 4 },
    game: { id: 37, title: 'Dead Space' },
  }))
  const requests = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    assert.equal(url.hostname, 'reviews-test.supabase.invalid')
    requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null })
    if (init?.method === 'PATCH') return Response.json({ ...rows[0], catalog: rows[0].game })
    assert.equal(url.searchParams.get('public_author.is_public'), 'eq.true')
    assert.equal(url.searchParams.get('or'), `(user_id.eq.${owner},review_visibility.eq.public,and(review_visibility.eq.profile,public_author.not.is.null))`)
    assert.ok(url.searchParams.get('select').includes('public_author:profiles()'))
    assert.equal(url.searchParams.get('catalog_id'), 'eq.37')
    // The mock returns only rows allowed by the requested publication policy.
    const visible = rows.filter((row) => row.user_id === owner || row.review_visibility === 'public' || row.review_visibility === 'profile' && row.author.is_public)
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 100)
    return Response.json(visible.slice(offset, offset + limit), { headers: { 'content-range': `${offset}-${Math.min(offset + limit, visible.length) - 1}/${visible.length}` } })
  }
  try {
    const { getReviewsFeed, getReviewsPage, updateUserGame } = await import('./supabase.js')
    const feed = await getReviewsFeed(owner, { catalogId: 37 })
    assert.deepEqual(feed.map((row) => row.id), [1, 2, 3, 5, 7, 8])
    assert.equal(feed[0].is_published, false)
    assert.equal(feed[2].is_published, true)
    assert.deepEqual(Object.keys(feed[2].author), ['username', 'avatar_url'])
    const first = await getReviewsPage(owner, { catalogId: 37 })
    const second = await getReviewsPage(owner, { catalogId: 37, page: 2 })
    assert.equal(first.total, 6); assert.equal(first.total_pages, 2)
    assert.equal(first.reviews.length, 5); assert.equal(second.reviews.length, 1)
    assert.equal(second.reviews[0].id, 8)
    await assert.rejects(() => updateUserGame(1, owner, { review_visibility: 'friends' }), /supported review visibility/)
    await updateUserGame(1, owner, { review_visibility: 'public', user_id: other })
    const write = requests.at(-1)
    assert.equal(write.url.searchParams.get('user_id'), `eq.${owner}`)
    assert.equal(write.url.searchParams.get('id'), 'eq.1')
    assert.equal(write.body.review_visibility, 'public')
    assert.equal(write.body.user_id, undefined)
  } finally { globalThis.fetch = originalFetch }
})
