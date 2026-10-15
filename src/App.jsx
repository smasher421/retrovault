import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const STATUS_OPTIONS = ['All', 'Backlog', 'Playing', 'Completed', '100% Completed', 'Abandoned']

const statusStyles = {
  Backlog: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/40',
  Playing: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/40',
  Completed: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/40',
  '100% Completed': 'bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-400/40',
  Abandoned: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/40',
}

const defaultForm = {
  title: '',
  platform: 'SNES',
  genre: 'Platformer',
  year: 1995,
  status: 'Backlog',
  notes: '',
  cover_image: '',
}

function App() {
  const [games, setGames] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [platformFilter, setPlatformFilter] = useState('All')
  const [form, setForm] = useState(defaultForm)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [metadataLoading, setMetadataLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState('')

  const loadGames = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/games')
      const data = await response.json()
      setGames(data)
    } catch (error) {
      console.error('Failed to load games:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const syncUser = async () => {
      if (!supabase) {
        setAuthLoading(false)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setAuthLoading(false)
    }

    syncUser()

    if (!supabase) {
      return undefined
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    loadGames()
  }, [])

  const platformOptions = useMemo(() => {
    const values = games.map((game) => game.platform)
    return ['All', ...new Set(values)]
  }, [games])

  const stats = useMemo(() => {
    const total = games.length
    const completed = games.filter(
      (game) => game.status === 'Completed' || game.status === '100% Completed',
    ).length
    const playing = games.filter((game) => game.status === 'Playing').length
    const backlog = games.filter((game) => game.status === 'Backlog').length

    return {
      total,
      completed,
      playing,
      backlog,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
    }
  }, [games])

  const visibleGames = useMemo(() => {
    return games.filter((game) => {
      const matchesSearch = `${game.title} ${game.platform}`
        .toLowerCase()
        .includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'All' || game.status === statusFilter
      const matchesPlatform = platformFilter === 'All' || game.platform === platformFilter

      return matchesSearch && matchesStatus && matchesPlatform
    })
  }, [games, search, statusFilter, platformFilter])

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: name === 'year' ? Number(value) : value,
    }))
  }

  const handleMetadataFetch = async () => {
    if (!form.title.trim()) {
      return
    }

    setMetadataLoading(true)

    try {
      const response = await fetch(`/api/metadata?title=${encodeURIComponent(form.title)}`)
      const data = await response.json()

      setForm((current) => ({
        ...current,
        title: data.title || current.title,
        platform: data.platform || current.platform,
        genre: data.genre || current.genre,
        year: data.year || current.year,
        cover_image: data.cover_image || current.cover_image,
      }))
    } catch (error) {
      console.error('Metadata lookup failed:', error)
    } finally {
      setMetadataLoading(false)
    }
  }

  const handleAddGame = async (event) => {
    event.preventDefault()

    if (!user && !supabase) {
      setAuthMessage('Log in with Steam or configure Supabase to save titles.')
      return
    }

    if (!form.title.trim()) {
      return
    }

    const response = await fetch('/api/games', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { 'x-user-id': user.id } : {}),
      },
      body: JSON.stringify({
        ...form,
        title: form.title.trim(),
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unable to add game' }))
      setAuthMessage(error.message)
      return
    }

    const newGame = await response.json()
    setGames((current) => [newGame, ...current])
    setForm(defaultForm)
    setAuthMessage('')
  }

  const handleDelete = async (gameId) => {
    const response = await fetch(`/api/games/${gameId}`, {
      method: 'DELETE',
      headers: {
        ...(user ? { 'x-user-id': user.id } : {}),
      },
    })

    if (response.ok) {
      setGames((current) => current.filter((game) => game.id !== gameId))
    }
  }

  const handleStatusChange = async (gameId, nextStatus) => {
    const response = await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { 'x-user-id': user.id } : {}),
      },
      body: JSON.stringify({ status: nextStatus }),
    })

    if (response.ok) {
      const updatedGame = await response.json()
      setGames((current) =>
        current.map((game) => (game.id === gameId ? updatedGame : game)),
      )
    }
  }

  const handleSteamLogin = async () => {
    if (!supabase) {
      setAuthMessage('Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Steam login.')
      return
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'steam',
        options: {
          redirectTo: `${window.location.origin}`,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      setAuthMessage(error.message)
    }
  }

  const handleSignOut = async () => {
    if (!supabase) {
      setUser(null)
      return
    }

    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1d283f_0%,_#0b1020_55%,_#060914_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">RetroVault</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">
              Collection Manager
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {!authLoading && (
              <>
                {user ? (
                  <>
                    <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      <p className="font-semibold">Signed in</p>
                      <p className="text-emerald-200">{user.email || user.user_metadata?.name || 'Steam user'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2.5 text-sm font-semibold text-slate-100"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleSteamLogin}
                    className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-sm font-black uppercase tracking-[0.18em] text-slate-950"
                  >
                    Log in with Steam
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        {!user && (
          <div className="mb-8 rounded-3xl border border-cyan-500/40 bg-cyan-500/10 p-5 text-cyan-100">
            <p className="text-sm font-medium">
              {supabase
                ? 'Connect your Steam account to sync the collection with Supabase.'
                : 'Supabase is not configured yet. You can still use the app in local demo mode.'}
            </p>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Total games', value: stats.total },
            { label: 'Completed', value: stats.completed },
            { label: 'Playing now', value: stats.playing },
            { label: 'Completion', value: `${stats.completionRate}%` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-lg shadow-slate-950/20"
            >
              <p className="text-sm text-slate-400">{item.label}</p>
              <p className="mt-3 text-3xl font-black text-white">{item.value}</p>
            </div>
          ))}
        </section>

        <main className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-950/40 p-5 shadow-xl shadow-slate-950/30">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="w-full md:max-w-xs">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Search collection
                </label>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a title or platform"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="w-full md:max-w-[220px]">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Platform
                </label>
                <select
                  value={platformFilter}
                  onChange={(event) => setPlatformFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                >
                  {platformOptions.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                    statusFilter === status
                      ? 'bg-cyan-400 text-slate-950'
                      : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-400/50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
                  Loading your vault...
                </div>
              ) : visibleGames.length ? (
                visibleGames.map((game) => (
                  <article
                    key={game.id}
                    className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 md:flex-row md:items-center"
                  >
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-500 text-lg font-black text-white shadow-lg shadow-cyan-500/20">
                      {game.cover_image ? (
                        <img src={game.cover_image} alt={game.title} className="h-full w-full object-cover" />
                      ) : (
                        <span>{game.title.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-bold text-white">{game.title}</h2>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusStyles[game.status] || 'bg-slate-700/50 text-slate-300'}`}
                        >
                          {game.status}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                        <span>{game.platform}</span>
                        <span>•</span>
                        <span>{game.genre}</span>
                        <span>•</span>
                        <span>{game.year}</span>
                      </div>

                      {game.notes && <p className="mt-3 text-sm text-slate-300">{game.notes}</p>}
                    </div>

                    <div className="flex flex-col gap-2 md:items-end">
                      <select
                        aria-label={`Change status for ${game.title}`}
                        value={game.status}
                        onChange={(event) => handleStatusChange(game.id, event.target.value)}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                      >
                        {STATUS_OPTIONS.filter((status) => status !== 'All').map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDelete(game.id)}
                        className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
                  No games match your filters.
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-slate-950/40 p-5 shadow-xl shadow-slate-950/30">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.3em] text-violet-300">Add game</p>
              <h2 className="mt-2 text-2xl font-black text-white">New entry</h2>
            </div>

            <form onSubmit={handleAddGame} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Title</label>
                <div className="flex gap-2">
                  <input
                    name="title"
                    value={form.title}
                    onChange={handleFormChange}
                    placeholder="Chrono Trigger"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleMetadataFetch}
                    disabled={metadataLoading || !form.title.trim()}
                    className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {metadataLoading ? '...' : 'Fetch'}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Platform</label>
                  <input
                    name="platform"
                    value={form.platform}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Genre</label>
                  <input
                    name="genre"
                    value={form.genre}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Year</label>
                  <input
                    type="number"
                    name="year"
                    value={form.year}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Status</label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-white focus:border-cyan-400 focus:outline-none"
                  >
                    {STATUS_OPTIONS.filter((status) => status !== 'All').map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Notes</label>
                <textarea
                  name="notes"
                  rows="4"
                  value={form.notes}
                  onChange={handleFormChange}
                  placeholder="Best memory, completion notes, or a quick review..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {authMessage && (
                <p className="text-sm text-amber-300">{authMessage}</p>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-sm font-black uppercase tracking-[0.2em] text-slate-950 transition hover:brightness-110"
              >
                Add to collection
              </button>
            </form>
          </aside>
        </main>
      </div>
    </div>
  )
}

export default App
