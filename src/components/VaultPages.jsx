import { useState } from 'react'
import { THEMES } from '../../shared/themes.js'
import { gogRequest } from '../useGogAccount.js'

const hours = (minutes = 0) => `${Math.round(minutes / 60).toLocaleString()}h`
const date = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not yet'
const statuses = ['Backlog', 'Playing', 'Completed', '100% Completed', 'Abandoned']

function GameStrip({ title, games, onOpen, empty, Cover }) {
  return <section className="vgui-window dashboard-section"><h2>{title}</h2>{games.length ? <div className="home-game-strip">{games.map((game) => <button className="home-game" key={game.id} onClick={() => onOpen(game)}><Cover game={game}/><span><b>{game.title}</b><small>{game.platform} · {game.playtime_available === false ? 'Playtime unavailable' : hours(game.playtime_minutes)}</small></span></button>)}</div> : <p className="muted-copy">{empty}</p>}</section>
}

export function HomePage({ profile, games, stats, navigate, openGame, Cover, gog }) {
  const recent = [...games].filter((game) => game.last_played_at || game.status === 'Playing').sort((a, b) => (Date.parse(b.last_played_at) || 0) - (Date.parse(a.last_played_at) || 0)).slice(0, 4)
  const backlog = [...games].filter((game) => game.status === 'Backlog').sort((a, b) => (b.is_favorite - a.is_favorite) || (b.metacritic_score || b.rating_avg || 0) - (a.metacritic_score || a.rating_avg || 0)).slice(0, 4)
  return <div className="dashboard-page">
    <section className="vgui-window home-hero"><div><small>Your games</small><h1>Welcome back, {profile?.username || 'player'}.</h1><p>Pick up where you left off, discover a classic, or choose what to play next.</p><div className="heading-actions"><button className="button primary" onClick={() => navigate('My Library')}>Open my library</button><button className="button" onClick={() => navigate('Backlog Picks')}>Find something to play</button></div></div><img src="/retrovault-logo.png" alt="RetroVault — pixel-art vault" width="1254" height="1254"/></section>
    <section className="stats-grid">{[['GAMES IN YOUR VAULT', stats.total], ['COMPLETED', `${stats.completion}%`], ['RECORDED PLAYTIME', hours(stats.playtime)], ['WAITING IN BACKLOG', stats.backlog]].map(([label, value]) => <div className="vgui-window stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section>
    <section className="vgui-window home-launcher" aria-labelledby="home-launcher-title"><h2 id="home-launcher-title">Explore RetroVault</h2><div className="home-command-list">{[
      ['My Library', 'Play games', 'Open your Steam, GOG, and console collection.'],
      ['Add Games', 'Add a game', 'Find a title from any platform and save it to your vault.'],
      ['Steam Store', 'Steam Store', 'Browse new releases, popular games, and current deals.'],
      ['GOG Store', 'GOG Store', 'Find classics, DRM-free releases, and special offers.'],
      ['My Profile', 'Player profile', gog?.connected ? `Your stats and reviews · GOG: ${gog.username}` : 'Your stats, reviews, connected accounts, and themes.'],
      ['Achievements', 'Achievements', 'See what you have unlocked and what is left to earn.'],
    ].map(([target, label, description]) => <button className="home-command" key={target} onClick={() => navigate(target)}><span className="home-command-label">{label}</span><span className="home-command-description">{description}</span></button>)}</div></section>
    <GameStrip title="Continue your journey" games={recent} onOpen={openGame} Cover={Cover} empty="Sync your accounts or mark a game as Playing to see it here."/>
    <GameStrip title="Already in your backlog" games={backlog} onOpen={openGame} Cover={Cover} empty="Your next adventure is out there. Browse the stores or search for a game to add."/>
  </div>
}

export function ThemePicker({ profile, onSave }) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const select = async (id) => {
    setBusy(true); setFailure('')
    try { await onSave({ preferred_theme: id, custom_theme: {} }) }
    catch (error) { setFailure(error.message) }
    finally { setBusy(false) }
  }
  return <section className="vgui-window dashboard-section"><div className="section-heading"><div><small>CHOOSE YOUR ATMOSPHERE</small><h2>Valve-inspired themes</h2><p>A new skin for the whole vault. Choosing a preset also resets custom colors.</p></div></div>
    {failure && <p role="alert">{failure}</p>}<div className="theme-grid">{THEMES.map((theme) => <button key={theme.id} className={`theme-card ${profile?.preferred_theme === theme.id ? 'selected' : ''}`} disabled={busy} aria-pressed={profile?.preferred_theme === theme.id} onClick={() => select(theme.id)} style={{ '--swatch-bg': theme.colors[0], '--swatch-panel': theme.colors[1], '--swatch-accent': theme.colors[6], '--swatch-text': theme.colors[4] }}><div className="theme-preview"><span>{theme.mark}</span><i/><i/><i/></div><b>{theme.name}</b><small>{theme.game}</small>{profile?.preferred_theme === theme.id && <em>SELECTED</em>}</button>)}</div>
  </section>
}

function GogConnection({ gog, refresh, error, navigate }) {
  const [attempt, setAttempt] = useState(null)
  const [callback, setCallback] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const running = gog?.job?.status === 'running'
  const act = async (action) => {
    setBusy(true); setMessage('')
    try { await action() } catch (failure) { setMessage(failure.message) }
    finally { setBusy(false) }
  }
  const connect = (event) => {
    event.preventDefault()
    void act(async () => {
      await gogRequest('/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: attempt.state, callback }) })
      setCallback(''); setAttempt(null)
      await refresh()
      await gogRequest('/sync', { method: 'POST' }); await refresh()
    })
  }
  return <article className="connected-account gog-account"><div className="account-heading"><span className="store-mark">G</span><div><small>GOG GALAXY</small><h3>{gog?.connected ? gog.username : 'Connect your GOG library'}</h3><p>{gog?.connected ? `Connected ${date(gog.connected_at)} · Last sync ${date(gog.last_synced_at)}` : 'Bring your DRM-free collection, GOG name, and available playtime into RetroVault.'}</p></div>{gog?.avatar_url && <img className="profile-avatar small-avatar" src={gog.avatar_url} alt=""/>}</div>
    {error && <p role="alert">{error} <button className="button small" onClick={refresh}>Retry</button></p>}
    {message && <p role="alert">{message}</p>}
    {gog?.job?.status === 'error' && <p role="alert">{gog.job.message}</p>}
    {gog?.job?.status === 'complete' && <p role="status">{gog.job.message}</p>}
    {running && <div className="sync-progress" role="status"><progress max={gog.job.total || 1} value={gog.job.processed}/><span>Syncing GOG… {gog.job.processed} / {gog.job.total || '…'} games. Keep RetroVault open; you can keep browsing. Sync resumes when you return.</span></div>}
    {gog?.connected && <p className="muted-copy">{gog.summary?.imported ?? '—'} games imported · {gog.summary?.stats_unavailable ?? '—'} without reported playtime. Only time tracked by GOG is available.</p>}
    <div className="heading-actions">
      {gog?.connected && <button className="button primary" disabled={busy || running} onClick={() => act(async () => { await gogRequest('/sync', { method: 'POST' }); await refresh() })}>↻ Sync GOG library</button>}
      <button className={`button ${gog?.connected ? '' : 'primary'}`} disabled={busy || running || !gog} onClick={() => act(async () => { setAttempt(await gogRequest('/start', { method: 'POST' })); setCallback('') })}>{gog?.connected ? 'Reconnect GOG' : 'Connect GOG'}</button>
      <button className="button" onClick={() => navigate('GOG Store')}>Browse GOG games</button>
      {gog?.connected && <button className="button small" disabled={busy || running} onClick={() => setConfirmDisconnect(true)}>Disconnect</button>}
    </div>
    {confirmDisconnect && <div className="gog-login"><p>Disconnect GOG? Your imported games and reviews stay in your vault. Saved account access will be removed.</p><button className="button" disabled={busy} onClick={() => act(async () => { await gogRequest('', { method: 'DELETE' }); setAttempt(null); setCallback(''); setConfirmDisconnect(false); await refresh() })}>Disconnect account</button> <button className="button" onClick={() => setConfirmDisconnect(false)}>Cancel</button></div>}
    {attempt && <form className="gog-login" onSubmit={connect}><h3>Finish connecting GOG</h3><ol><li><a className="button primary" href={attempt.url} target="_blank" rel="noreferrer">Open secure GOG sign-in ↗</a></li><li>Sign in on GOG. When you reach the blank success page, copy its full URL from the address bar.</li><li>Paste that URL below, then connect. This sign-in window expires after 10 minutes.</li></ol><label>GOG success URL<input type="url" required autoComplete="off" spellCheck="false" value={callback} onChange={(event) => setCallback(event.target.value)} placeholder="https://embed.gog.com/on_login_success?…"/></label><div className="heading-actions"><button className="button primary" disabled={busy || !callback}>Connect & sync library</button><button className="button" type="button" onClick={() => { setAttempt(null); setCallback('') }}>Cancel</button></div></form>}
  </article>
}

function Distribution({ title, entries }) {
  const max = Math.max(1, ...entries.map(([, count]) => count))
  return <section className="vgui-window dashboard-section"><h2>{title}</h2><div className="profile-bars">{entries.length ? entries.map(([label, count]) => <div key={label}><span>{label}</span><div className="profile-bar"><i style={{ width: `${count / max * 100}%` }}/></div><b>{count}</b></div>) : <p>No games yet.</p>}</div></section>
}

export function ProfilePage({ profile, games, stats, logs, saveProfile, navigate, openGame, gogState, Cover }) {
  const [bio, setBio] = useState(profile?.bio || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewPage, setReviewPage] = useState(1)
  const [reviewSort, setReviewSort] = useState('recent')
  const reviews = games.filter((game) => game.review_text?.trim()).sort((a, b) => reviewSort === 'rating' ? (b.rating || 0) - (a.rating || 0) : (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))
  const page = Math.min(reviewPage, Math.max(1, Math.ceil(reviews.length / 6)))
  const group = (key) => Object.entries(games.reduce((all, game) => { for (const name of key === 'genres' ? game.genres || [] : [game[key] || 'Unknown']) all[name] = (all[name] || 0) + 1; return all }, {})).sort((a, b) => b[1] - a[1]).slice(0, 7)
  const rated = games.filter((game) => game.rating)
  const favorites = games.filter((game) => game.is_favorite).length
  const gogGames = games.filter((game) => game.source === 'gog')
  const submitBio = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await saveProfile({ bio }) } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <div className="dashboard-page profile-page">
    <section className="vgui-window profile-hero"><img className="profile-avatar" src={profile?.avatar_url || '/retrovault-logo.png'} alt=""/><div><small>MY PLAYER PROFILE</small><h1>{profile?.username}</h1><div className="identity-tags"><span>Steam · {profile?.username}</span>{gogState.account?.connected && <span>GOG · {gogState.account.username}</span>}<span>{profile?.is_public ? 'Public profile' : 'Private profile'}</span></div><p>{profile?.bio || 'Every game tells a story. This is yours.'}</p><small>Vault member since {date(profile?.created_at)}{profile?.steam_created_at ? ` · On Steam since ${date(profile.steam_created_at)}` : ''}</small></div><button className="button" onClick={() => navigate('Achievements')}>View achievements →</button></section>
    <section className="stats-grid">{[['GAMES', stats.total], ['RECORDED PLAYTIME', hours(stats.playtime)], ['COMPLETED', `${stats.completed} / ${stats.total}`], ['MY REVIEWS', reviews.length], ['FAVORITES', favorites], ['AVERAGE RATING', rated.length ? `${(rated.reduce((sum, game) => sum + game.rating, 0) / rated.length).toFixed(1)} / 10` : '—']].map(([label, value]) => <div className="vgui-window stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section>
    <div className="profile-columns"><Distribution title="Your progress" entries={statuses.map((status) => [status, games.filter((game) => game.status === status).length])}/><Distribution title="Platforms in your vault" entries={group('platform')}/><Distribution title="Your favourite genres" entries={group('genres')}/></div>
    <section className="vgui-window dashboard-section"><h2>Connected accounts</h2><article className="connected-account"><div className="account-heading"><span className="store-mark">S</span><div><small>STEAM</small><h3>{profile?.username}</h3><p>{games.filter((game) => game.source === 'steam').length} Steam games · {hours(games.filter((game) => game.source === 'steam').reduce((sum, game) => sum + game.playtime_minutes, 0))} recorded</p></div><button className="button" onClick={() => navigate('My Library')}>Open library</button></div></article><GogConnection gog={gogState.account} refresh={gogState.refresh} error={gogState.error} navigate={navigate}/>{gogGames.length > 0 && <p className="muted-copy">GOG in your vault: {gogGames.length} games · {hours(gogGames.reduce((sum, game) => sum + game.playtime_minutes, 0))} reported playtime.</p>}</section>
    <GameStrip title="Most played" games={[...games].filter((game) => game.playtime_minutes > 0).sort((a, b) => b.playtime_minutes - a.playtime_minutes).slice(0, 4)} onOpen={openGame} Cover={Cover} empty="Sync your game libraries to see recorded playtime."/>
    <section className="vgui-window dashboard-section"><div className="section-heading"><div><small>YOUR WORDS, YOUR VERDICT</small><h2>My reviews <span>{reviews.length}</span></h2></div><label>Sort <select value={reviewSort} onChange={(event) => { setReviewSort(event.target.value); setReviewPage(1) }}><option value="recent">Recently updated</option><option value="rating">Highest rated</option></select></label></div>{reviews.length ? <><div className="profile-reviews">{reviews.slice((page - 1) * 6, page * 6).map((game) => <article key={game.id}><Cover game={game}/><div><h3>{game.title}</h3><small>{game.platform} · {game.rating ? `${game.rating}/10` : 'Not rated'}</small><p>{game.review_text}</p><button className="button small" onClick={() => openGame(game)}>Read / edit review</button></div></article>)}</div><div className="page-controls"><button className="button" disabled={page === 1} onClick={() => setReviewPage(page - 1)}>Previous</button><span>{page} / {Math.ceil(reviews.length / 6)}</span><button className="button" disabled={page * 6 >= reviews.length} onClick={() => setReviewPage(page + 1)}>Next</button></div></> : <p>No reviews yet. Open a game from your library to write your first one.</p>}</section>
    <div className="profile-columns"><section className="vgui-window dashboard-section"><h2>About you</h2><form onSubmit={submitBio}><label>Player bio<textarea value={bio} maxLength={500} rows={4} onChange={(event) => setBio(event.target.value)} placeholder="Favourite games, genres, or what you’re playing…"/></label><small>{bio.length}/500</small>{error && <p role="alert">{error}</p>}<button className="button primary" disabled={busy}>Save bio</button></form><button className="button" onClick={() => navigate('People you follow')}>Profile visibility & sharing</button></section><section className="vgui-window dashboard-section"><h2>Recent activity</h2>{logs.length ? logs.slice(0, 5).map((log) => <div className="profile-activity" key={log.id}><span><b>{log.catalog?.title || 'Game session'}</b><small>{date(log.happened_at)} · {log.source}</small></span><strong>+{hours(log.delta_minutes)}</strong></div>) : <p>New playtime appears here after syncing.</p>}<button className="button" onClick={() => navigate('Activity')}>View activity</button></section></div>
    <ThemePicker profile={profile} onSave={saveProfile}/><button className="button" onClick={() => navigate('Settings')}>Custom colors & interface settings</button>
  </div>
}
