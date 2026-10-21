import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import { registerLibraryRoutes, steamMetadata } from './library-metadata.js'

test('metadata distinguishes store features, actual user tags, and missing review data', () => {
  const metadata = steamMetadata({ platforms: { windows: true, mac: false }, categories: [{ description: 'Single-player' }, { description: 'Steam Cloud' }], type: 'game', is_free: false, controller_support: 'full', achievements: { total: 33 } }, { success: 1, query_summary: { total_reviews: 100, total_positive: 95, review_score_desc: 'Very Positive' } }, { success: 1, results: { resolved_category: 3 } }, '<a href="x" class="app_tag" style="display:none">Story Rich</a><a class="app_tag">Open World</a>')
  assert.deepEqual(metadata.tags, ['Story Rich', 'Open World'])
  assert.deepEqual(metadata.os, ['Windows'])
  assert.equal(metadata.positivePercent, 95)
  assert.equal(metadata.deck, 'Verified')
  assert.equal(metadata.cloud, 'Yes')
  assert.equal(metadata.workshop, 'No')
  assert.deepEqual(metadata.mode, ['Singleplayer'])
  assert.equal(metadata.achievementCount, 33)
  const missing = steamMetadata(null, null, null)
  assert.equal(missing.positivePercent, undefined)
  assert.equal(missing.os, undefined)
  assert.equal(missing.controller, undefined)
})
test('refresh requires ownership for the entire batch and preserves partial provider failures', async () => {
  const app = express(); app.use(express.json())
  const calls = [], writes = []
  registerLibraryRoutes(app, {
    requireUser: (req, res, next) => { if (!req.get('x-test-user')) return res.sendStatus(401); req.userId = 'owner'; next() },
    appOrigin: () => 'https://retrovault.example',
    getOwnedGames: async (user, ids) => { assert.equal(user, 'owner'); return ids.filter((id) => id !== '999').map((id) => ({ id, catalog_id: Number(id) + 10, steam_app_id: 220 })) },
    updateCatalogDetails: async (...args) => { writes.push(args) },
    fetchMetadata: async (game) => { calls.push(game.id); if (game.id === '2') throw new Error('Provider unavailable'); return { tags: ['RPG'] } },
    fetchAchievements: async (user) => { assert.equal(user, 'owner'); return { total: 10, completed: 9, source: 'Steam' } },
    saveAchievementSummary: async (...args) => { writes.push(args); return args[2] },
  })
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}/api/library/refresh`
  const post = (body, headers = { 'x-test-user': 'owner' }) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  try {
    assert.equal((await post({ ids: ['1'] }, {})).status, 401)
    assert.equal((await post({ ids: ['1', '999'] })).status, 404)
    assert.deepEqual(calls, []); assert.deepEqual(writes, [])
    assert.equal((await post({ ids: ['1', '2', '3', '4', '5'] })).status, 400)
    assert.equal((await post({ ids: ['1'] }, { 'x-test-user': 'owner', origin: 'https://other.example' })).status, 403)
    const result = await (await post({ ids: ['1', '2'] })).json()
    assert.equal(result.results[0].discovery_metadata.tags[0], 'RPG')
    assert.match(result.results[1].error, /Provider unavailable/)
    assert.equal(writes.length, 1)
    const progress = await (await post({ ids: ['1'], mode: 'achievements' })).json()
    assert.equal(progress.results[0].achievements_summary.completed, 9)
    assert.equal(writes[1][1], 'owner')
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
