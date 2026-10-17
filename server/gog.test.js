import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import express from 'express'

test('GOG survives separate app instances and checkpoints batches under a concurrent lease', async () => {
  const originalFetch = globalThis.fetch
  const previousEnv = { ...process.env }
  process.env.SUPABASE_URL = 'https://gog-test.supabase.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  process.env.SESSION_SECRET = 'test-only-encryption-secret'
  const userId = '00000000000000001'
  let connection = null
  let imported = []
  let releaseBatch
  let batchEntered
  const entered = new Promise((resolve) => { batchEntered = resolve })
  const blockedBatch = new Promise((resolve) => { releaseBatch = resolve })
  const servers = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const body = init?.body ? JSON.parse(init.body) : null
    if (url.hostname === '127.0.0.1') return originalFetch(input, init)
    if (url.hostname === 'gog-test.supabase.invalid') {
      const table = url.pathname.split('/').at(-1)
      if (table === 'gog_connections') {
        if (init?.method === 'POST') connection = structuredClone(body)
        if (init?.method === 'PATCH' && body.sync_summary) {
          const expected = JSON.parse(url.searchParams.get('sync_summary').slice(3))
          if (!isDeepStrictEqual(expected, connection.sync_summary)) return Response.json([])
          Object.assign(connection, structuredClone(body))
        }
        if (init?.method === 'PATCH' && !body.sync_summary) Object.assign(connection, body)
        return Response.json(init?.method === 'POST' ? connection : connection ? [connection] : [])
      }
      if (table === 'games_catalog') {
        const id = Number(url.searchParams.get('gog_product_id').slice(3))
        if (id === 8) return Response.json({ message: 'Simulated product lookup failure' }, { status: 400 })
        return Response.json([{ id, metadata_updated_at: new Date().toISOString() }])
      }
      if (table === 'sync_gog_library') {
        imported.push(...body.p_games)
        return Response.json(body.p_games.length)
      }
    }
    if (url.hostname === 'auth.gog.com' && url.pathname === '/token') return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', user_id: '42', expires_in: 3600 })
    if (url.hostname === 'users.gog.com') return Response.json({ username: 'Test player' })
    if (url.hostname === 'galaxy-library.gog.com') return Response.json({ items: (url.searchParams.has('page_token') ? [6, 7, 8, 9] : [1, 2, 3, 4, 5, 6]).map((id) => ({ platform_id: 'gog', external_id: id })), next_page_token: url.searchParams.has('page_token') ? '' : 'second-page' })
    if (url.hostname === 'gameplay.gog.com') {
      batchEntered(); await blockedBatch
      return Response.json(url.pathname.includes('/games/9/') ? {} : { time_sum: 60, items: [] })
    }
    throw new Error(`Unexpected test request: ${url.origin}${url.pathname}`)
  }
  try {
    const { registerGogRoutes } = await import('./gog.js')
    const instance = async () => {
      const app = express(); app.use(express.json())
      registerGogRoutes(app, (req, res, next) => { req.userId = userId; next() }, (req) => `http://${req.get('host')}`)
      const server = app.listen(0, '127.0.0.1'); servers.push(server)
      await new Promise((resolve) => server.once('listening', resolve))
      return `http://127.0.0.1:${server.address().port}/api/accounts/gog`
    }
    const first = await instance()
    const attempt = await fetch(`${first}/start`, { method: 'POST' })
    assert.equal(attempt.status, 200)
    const { state } = await attempt.json()
    const cookie = attempt.headers.get('set-cookie').split(';')[0]
    await new Promise((resolve) => servers[0].close(resolve))
    const second = await instance()
    const connected = await fetch(`${second}/connect`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ state, callback: 'https://embed.gog.com/on_login_success?code=test-code' }) })
    assert.equal(connected.status, 200)
    assert.equal((await connected.json()).username, 'Test player')
    assert.equal((await fetch(`${second}/sync`, { method: 'POST' })).status, 202)
    const step = (root) => fetch(`${root}/sync/continue`, { method: 'POST' }).then(async (response) => { assert.equal(response.status, 200); return response.json() })
    await step(second); await step(second)
    assert.equal(connection.sync_summary._sync.total, 9, 'Ownership pages must deduplicate IDs')
    const third = await instance()
    const pending = step(third)
    await entered
    const concurrent = await step(second)
    assert.equal(concurrent.processed, 0, 'Concurrent request must observe the lease')
    releaseBatch()
    assert.equal((await pending).processed, 6)
    const complete = await step(second)
    assert.equal(complete.status, 'complete')
    assert.equal(complete.processed, 9)
    assert.equal(complete.imported, 8)
    assert.equal(complete.failed, 1)
    assert.equal(complete.statsUnavailable, 1)
    assert.equal(new Set(imported.map((game) => game.catalog_id)).size, 8)
    assert.equal(imported.length, 8, 'Concurrent steps must not duplicate imported batches')
    assert.equal(imported.find((game) => game.catalog_id === 9).playtime_minutes, null)
    const visible = await (await fetch(third)).json()
    assert.equal(visible.summary.imported, 8)
    assert.ok(connection.last_synced_at)
    assert.equal(visible.summary._sync, undefined)
    assert.equal(visible.job.ids, undefined)
    assert.equal(visible.tokens_encrypted, undefined)
  } finally {
    releaseBatch()
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
    globalThis.fetch = originalFetch
    process.env = previousEnv
  }
})
