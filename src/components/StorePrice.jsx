export default function StorePrice({ game }) {
  const amount = game.final_price
  let current = 'Price unavailable'
  let original = null
  if (amount === 0) current = 'Free'
  if (amount != null && /^[A-Z]{3}$/.test(game.currency || '')) {
    const format = new Intl.NumberFormat(undefined, { style: 'currency', currency: game.currency })
    if (amount > 0) current = format.format(amount / 100)
    if (game.original_price > amount) original = format.format(game.original_price / 100)
  }
  const discounted = original && game.discount_percent > 0
  return <div className="price-block">
    {discounted && <strong className="price-discount">−{game.discount_percent}%</strong>}
    <div className="steam-product-price">{original && <del>{original}</del>}<b>{current}</b></div>
  </div>
}
