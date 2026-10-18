import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function GameActionsMenu({ title, x, y, opener, items, onClose }) {
  const menu = useRef(null)
  useEffect(() => {
    menu.current?.querySelector('[role="menuitem"]')?.focus()
    const outside = (event) => {
      if (!menu.current?.contains(event.target) && !event.target.closest('.game-menu-trigger')) onClose()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const keyboard = (event) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault()
      onClose(); opener?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const buttons = [...menu.current.querySelectorAll('[role="menuitem"]')]
    const current = buttons.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return createPortal(<div ref={menu} className="game-context-menu" role="menu" aria-label={`${title} actions`} onKeyDown={keyboard} style={{ left: Math.max(8, Math.min(x, window.innerWidth - 248)), top: Math.max(8, Math.min(y, window.innerHeight - 310)) }}>
    <div className="game-context-title">{title}</div>
    {items.map((item, index) => item.separator ? <div role="separator" key={`separator-${index}`}/> : <button type="button" role="menuitem" tabIndex={-1} key={item.label} onPointerEnter={(event) => event.currentTarget.focus({ preventScroll: true })} onClick={() => { onClose(); item.action() }}><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</button>)}
  </div>, document.body)
}
