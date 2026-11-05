// Keeps 8 fountain pins spread around the user (nearest first) and hides the rest; names them #pin1..#pin8.
// Also names the "1 min a pie" line #walkline. The nearest pin is the selected one.
(() => {
  const me = document.querySelector('.me').getBoundingClientRect();
  const cx = me.x + me.width / 2, cy = me.y + me.height / 2;
  const top = 70, bottom = document.querySelector('[data-testid=handle]').getBoundingClientRect().y - 30;
  const all = [...document.querySelectorAll('.mkw')].filter((w) => w.querySelector('.mk')).map((w) => {
    const r = w.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return {w, x, y, d: Math.hypot(x - cx, y - cy)};
  }).filter((p) => p.x > 30 && p.x < 360 && p.y > top && p.y < bottom).sort((a, b) => a.d - b.d);
  const keep = [];
  for (const p of all) {
    const sel = p.w.querySelector('.mk.sel');
    if (sel || keep.every((k) => Math.hypot(k.x - p.x, k.y - p.y) > 78)) keep.push(p);
    if (keep.length >= 8) break;
  }
  const sel = keep.findIndex((p) => p.w.querySelector('.mk.sel'));
  if (sel > 0) keep.unshift(...keep.splice(sel, 1));
  const set = new Set(keep.map((k) => k.w));
  document.querySelectorAll('.mkw, .mkc').forEach((w) => { if (!set.has(w) && !w.querySelector('.me')) w.style.display = 'none'; });
  keep.forEach((k, i) => { k.w.querySelector('.mk').id = 'pin' + (i + 1); });
  const line = [...document.querySelectorAll('[data-testid=details] *')].filter((e) => /min a pie/.test(e.textContent) && ![...e.children].some((c) => /min a pie/.test(c.textContent)))[0];
  if (line) line.id = 'walkline';
  return keep.length;
})();
