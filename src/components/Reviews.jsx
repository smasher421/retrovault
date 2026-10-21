import { useEffect, useId, useRef, useState } from 'react'

function useReviewsPage(url, revision) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Reviews are temporarily unavailable. Please retry.')
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not load reviews.')
      if (!controller.signal.aborted) setResult({ url, revision, data })
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ url, revision, error: error.message })
    })
    return () => controller.abort()
  }, [url, revision])
  return result?.url === url && result?.revision === revision ? result : { loading: true }
}

export function ReviewText({ text = '' }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const root = useRef(null)
  const preview = text.split('\n').slice(0, 6).join('\n').slice(0, 500).trimEnd()
  const long = preview.length < text.trimEnd().length
  return <div className="review-body" ref={root}>
    <p id={id}>{expanded || !long ? text : `${preview}…`}</p>
    {long && <button type="button" className="review-expand" aria-expanded={expanded} aria-controls={id} onClick={() => {
      if (expanded) root.current?.scrollIntoView({ block: 'nearest' })
      setExpanded((value) => !value)
    }}>{expanded ? 'Show less' : 'Read more'}</button>}
  </div>
}

function ReviewPager({ page, totalPages, hasNext, loading, onChange }) {
  return <nav className="review-pagination" aria-label="Review pages">
    <button type="button" className="button small" disabled={loading || page === 1} onClick={() => onChange(page - 1)}>← Previous</button>
    <span aria-live="polite">Page {page}{totalPages ? ` of ${totalPages}` : ''}</span>
    <button type="button" className="button small" disabled={loading || !hasNext} onClick={() => onChange(page + 1)}>Next →</button>
  </nav>
}

function ReviewState({ loading, error, empty, retry }) {
  if (loading) return <p className="steam-review-state" role="status">Loading reviews…</p>
  if (error) return <div className="steam-review-state review-error" role="alert"><p>{error}</p><button className="button small" onClick={retry}>Retry</button></div>
  if (empty) return <p className="steam-review-state">No reviews match these filters.</p>
  return null
}

// A different app gets its own cursor history and filter state.
export function SteamReviewsPanel(props) {
  return <SteamReviews key={props.steamAppId} {...props}/>
}

function SteamReviews({ steamAppId, gameTitle }) {
  const [filters, setFilters] = useState({ sort: 'helpful', sentiment: 'all' })
  const [navigation, setNavigation] = useState({ page: 1, cursors: ['*'] })
  const [revision, setRevision] = useState(0)
  const heading = useRef(null)
  const cursor = navigation.cursors[navigation.page - 1]
  const params = new URLSearchParams({ ...filters, cursor })
  const { data, error, loading } = useReviewsPage(`/api/steam/reviews/${steamAppId}?${params}`, revision)
  const reviews = data?.reviews || []
  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setNavigation({ page: 1, cursors: ['*'] })
  }
  const changePage = (page) => {
    setNavigation((current) => ({ page, cursors: page > current.page
      ? [...current.cursors.slice(0, current.page), data.next_cursor] : current.cursors }))
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'start' })
  }
  return <section className="steam-reviews-panel" aria-busy={Boolean(loading)}>
    <div className="review-feed-heading steam-review-heading"><div><h2 ref={heading} tabIndex={-1}>Steam community reviews</h2><small>English · 5 per page{data?.total_reviews != null ? ` · ${data.total_reviews.toLocaleString()} matching reviews` : ''}</small></div><a href={`https://store.steampowered.com/app/${steamAppId}/`} target="_blank" rel="noreferrer">{gameTitle} on Steam ↗</a></div>
    <div className="steam-review-toolbar">
      <label>Order<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="helpful">Most helpful</option><option value="recent">Newest</option><option value="updated">Recently updated</option></select></label>
      <label>Sentiment<select value={filters.sentiment} onChange={(event) => updateFilter('sentiment', event.target.value)}><option value="all">All reviews</option><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
      <button type="button" className="button small" disabled={loading} onClick={() => { setNavigation({ page: 1, cursors: ['*'] }); setRevision((value) => value + 1) }}>Refresh</button>
      <span>{filters.sort === 'helpful' ? 'Ranked by Steam helpfulness and review quality' : filters.sort === 'recent' ? 'Newest reviews first' : 'Most recently updated first'}</span>
    </div>
    <ReviewState loading={loading} error={error} empty={!reviews.length} retry={() => setRevision((value) => value + 1)}/>
    {!loading && !error && <div className="steam-review-list" key={`${filters.sort}-${filters.sentiment}-${navigation.page}`}>{reviews.map((review) => <article className="steam-review-card" key={review.review_id}>
      <div className="steam-review-meta"><strong className={review.recommended ? 'positive' : 'negative'}>{review.recommended ? 'Recommended' : 'Not recommended'}</strong><span>{review.author}{review.created_at ? ` · ${new Date(review.created_at).toLocaleDateString()}` : ''}</span><span>{(review.playtime_minutes / 60).toFixed(1)}h played</span><span>{Number(review.helpful).toLocaleString()} found helpful</span></div>
      <ReviewText text={review.text}/>
    </article>)}</div>}
    <ReviewPager page={navigation.page} loading={loading} hasNext={!error && Boolean(data?.next_cursor) && !navigation.cursors.slice(0, navigation.page).includes(data.next_cursor)} onChange={changePage}/>
  </section>
}

export function VaultReviewsPanel({ catalogId, refreshKey = '', onOpenGame }) {
  const [filters, setFilters] = useState({ sort: 'recent', rating: 'all' })
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const heading = useRef(null)
  const params = new URLSearchParams({ ...filters, page })
  const endpoint = catalogId ? `/api/catalog/${catalogId}/reviews` : '/api/reviews/page'
  const { data, error, loading } = useReviewsPage(`${endpoint}?${params}`, `${revision}:${refreshKey}`)
  const reviews = data?.reviews || []
  const updateFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }
  return <section className="steam-reviews-panel vault-reviews-panel" aria-busy={Boolean(loading)}>
    <div className="review-feed-heading steam-review-heading"><div><h2 ref={heading} tabIndex={-1}>RetroVault player reviews</h2><small>Public community reviews + your own private reviews. {data ? `${data.total} matching reviews · ` : ''}5 per page</small></div></div>
    <div className="steam-review-toolbar">
      <label>Order<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="recent">Newest</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select></label>
      <label>Rating<select value={filters.rating} onChange={(event) => updateFilter('rating', event.target.value)}><option value="all">All ratings</option><option value="positive">Positive · 7–10</option><option value="mixed">Mixed · 4–6</option><option value="negative">Negative · 1–3</option><option value="unrated">Without a rating</option></select></label>
      <button type="button" className="button small" disabled={loading} onClick={() => { setPage(1); setRevision((value) => value + 1) }}>Refresh</button>
    </div>
    <ReviewState loading={loading} error={error} empty={!reviews.length} retry={() => setRevision((value) => value + 1)}/>
    {!loading && !error && <div key={`${filters.sort}-${filters.rating}-${page}`}>{reviews.map((review) => <article className="steam-review-card" key={review.id}>
      {!catalogId && <h3>{review.game.title}</h3>}
      <div className="community-review-author">{review.author.avatar_url && <img src={review.author.avatar_url} alt="" loading="lazy"/>}<span><b>{review.author.username}{review.is_mine ? ' · You' : ''}</b><small>{review.rating ? `${review.rating}/10` : 'No rating'} · {new Date(review.updated_at).toLocaleDateString()}</small></span></div>
      {review.is_mine && <small className="review-visibility-label">{review.is_published ? 'Public review' : 'Private review - only you can see this'}</small>}
      <ReviewText text={review.review_text}/>
      {onOpenGame && <button className="button small" onClick={() => onOpenGame(review.game)}>{review.is_mine ? 'Edit your review' : 'Game details'}</button>}
    </article>)}</div>}
    <ReviewPager page={page} totalPages={data?.total_pages} loading={loading} hasNext={!error && page < data?.total_pages} onChange={(next) => { setPage(next); heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }) }}/>
  </section>
}
