// The service header only: no card (a card names a real place), pins kept to the 10 nearest the user.
(() => {
  for (const t of ['nearest', 'nearby', 'more-links', 'bizi-bar', 'bizi-status']) document.querySelectorAll(`[data-testid=${t}]`).forEach((e) => { e.style.display = 'none'; });
  const me = document.querySelector('.me').getBoundingClientRect();
  const cx = me.x + me.width / 2, cy = me.y + me.height / 2;
  const top = 70, bottom = document.querySelector('[data-testid=handle]').getBoundingClientRect().y - 30;
  const all = [...document.querySelectorAll('.mkw')].filter((w) => w.querySelector('.mk')).map((w) => {
    const r = w.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return {w, x, y, d: Math.hypot(x - cx, y - cy)};
  }).sort((a, b) => a.d - b.d);
  const keep = [];
  for (const p of all) {
    if (p.x > 30 && p.x < 360 && p.y > top && p.y < bottom && keep.every((k) => Math.hypot(k.x - p.x, k.y - p.y) > 70)) keep.push(p);
    if (keep.length >= 9) break;
  }
  const set = new Set(keep.map((k) => k.w));
  document.querySelectorAll('.mkw, .mkc').forEach((w) => { if (!set.has(w) && !w.querySelector('.me')) w.style.display = 'none'; });
})();
