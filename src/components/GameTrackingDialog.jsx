import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TRACKING_FIELDS, TRACKING_GROUPS } from '../../shared/library-schema.js'
import { gameAttribute } from '../../shared/library-filters.js'

export default function GameTrackingDialog({ game, onClose, onSave }) {
  const [tracking, setTracking] = useState(game.tracking || {})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [hltbId, setHltbId] = useState('')
  const [importing, setImporting] = useState(false)
  const [estimate, setEstimate] = useState(null)
  const dialog = useRef(null)
  useEffect(() => {
    const opener = document.activeElement
    dialog.current?.querySelector('button')?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      requestAnimationFrame(() => {
        const target = opener?.isConnected && opener !== document.body ? opener : [...document.querySelectorAll('.game-card')].find((card) => card.dataset.gameId === String(game.id))?.querySelector('.game-menu-trigger')
        target?.focus()
      })
    }
  }, [game.id])
  const update = (key, value) => setTracking((current) => ({ ...current, [key]: value }))
  const keyboard = (event) => {
    if (event.key === 'Escape' && !saving) { event.stopPropagation(); onClose() }
    if (event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary')].filter((element) => element.getClientRects().length)
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
  }
  return createPortal(<div className="tracking-backdrop" onKeyDown={keyboard}><section ref={dialog} className="vgui-window tracking-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-title">
    <header><div><small>YOUR PRIVATE GAME RECORD</small><h2 id="tracking-title">{game.title} · Planning & progress</h2></div><button className="button" disabled={saving} onClick={onClose} aria-label="Close planning">×</button></header>
    <p className="filter-hint">Your planning stays private. Blank means unknown or use provider data. Manual values override provider data. Campaign progress is independent of achievements.</p>
    {game.discovery_metadata?.provider && <p className="filter-hint">Metadata: {game.discovery_metadata.provider}{game.discovery_metadata.updatedAt ? ` · refreshed ${new Date(game.discovery_metadata.updatedAt).toLocaleDateString()}` : ''}{game.discovery_metadata.incomplete ? ' · some provider fields are unavailable' : ''}</p>}
    <form onSubmit={async (event) => {
      event.preventDefault(); setSaving(true); setError('')
      const values = Object.fromEntries(Object.entries(tracking).map(([key, value]) => [key, TRACKING_FIELDS.find((field) => field.key === key)?.type === 'list' && typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value]))
      try { await onSave(game, { tracking: values }); onClose() } catch (reason) { setError(reason.message) } finally { setSaving(false) }
    }}>
      {TRACKING_GROUPS.map((group, index) => <details key={group.name} open={index === 0 || undefined}><summary>{group.name}</summary><div className="library-filter-grid">{group.fields.map((field) => {
        const value = tracking[field.key] ?? ''
        const known = gameAttribute({ ...game, tracking: {} }, field.key)
        return <label className="library-filter-field" key={field.key}>{field.label}{field.type === 'select' ? <select aria-label={field.label} value={value} onChange={(event) => update(field.key, event.target.value)}><option value="">Unknown / use provider</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={field.label} type={field.type === 'list' ? 'text' : field.type} min={field.type === 'number' ? 0 : undefined} max={field.max} step={field.type === 'number' ? 'any' : undefined} maxLength={field.type === 'list' ? 2000 : 200} value={Array.isArray(value) ? value.join(', ') : value} onChange={(event) => update(field.key, field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}/>}{known != null && known !== '' && (!Array.isArray(known) || known.length > 0) && <small>Provider / default: {Array.isArray(known) ? known.join(', ') : known}</small>}</label>
      })}</div></details>)}
      <details><summary>HowLongToBeat estimate import</summary><div className="estimate-import"><p>Find the exact release, then enter its game URL or ID. Review the title before applying; estimates remain editable.</p><a className="button small" href={`https://howlongtobeat.com/?q=${encodeURIComponent(game.title)}`} target="_blank" rel="noreferrer">Find on HowLongToBeat ↗</a><label>Game URL or ID<input value={hltbId} onChange={(event) => { setHltbId(event.target.value); setEstimate(null) }} placeholder="https://howlongtobeat.com/game/…"/></label><button type="button" className="button" disabled={importing || !hltbId.trim()} onClick={async () => {
        const id = hltbId.trim().match(/^(?:https:\/\/howlongtobeat\.com\/game\/)?(\d+)\/?$/)?.[1]
        if (!id) { setError('Enter a HowLongToBeat game URL or numeric ID.'); return }
        setImporting(true); setError(''); setEstimate(null)
        try { const response = await fetch(`/api/library/estimates/${id}`); const result = await response.json(); if (!response.ok) throw new Error(result.message); setEstimate(result) } catch (reason) { setError(reason.message) } finally { setImporting(false) }
      }}>{importing ? 'Reading estimates…' : 'Preview estimates'}</button>{estimate && <div role="status"><b>{estimate.title}</b><p>Main story: {estimate.mainHours ?? 'Unknown'}h · Extras: {estimate.extraHours ?? 'Unknown'}h · Completionist: {estimate.completeHours ?? 'Unknown'}h</p><button className="button" type="button" onClick={() => { const values = Object.fromEntries(Object.entries(estimate).filter(([key]) => key !== 'title')); setTracking((current) => ({ ...current, ...values })); setEstimate(null) }}>Use these estimates for this game</button></div>}<small>When HowLongToBeat blocks automated access, enter the durations and source link in Time & commitment.</small></div></details>
      {error && <p className="filter-error" role="alert">{error}</p>}
      <footer><button className="button" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save planning'}</button></footer>
    </form>
  </section></div>, document.body)
}
