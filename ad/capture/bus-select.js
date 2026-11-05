// Opens the bus stop "Zalmedina" (a street corner; its times are served from capture/live/bus.json) by pressing its pin.
(async () => {
  const seen = new Set();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const name = () => document.querySelector('[data-testid=nearest-name]')?.textContent || '';
  // The stop is the pin 258 px above the blue dot in the first map view, and that is off the top of the screen: drag the map down first.
  // (Pressing any pin pans the map, so this must come before pressing pins.)
  const box = document.querySelector('.leaflet-container');
  const fire = (type, y, target) => target.dispatchEvent(new MouseEvent(type, {bubbles: true, clientX: 200, clientY: y, button: 0, buttons: 1}));
  fire('mousedown', 300, box);
  for (let y = 300; y <= 480; y += 15) { fire('mousemove', y, document); await wait(16); }
  fire('mouseup', 480, document);
  // a press without movement clears Leaflet's "the map was just dragged" flag, which swallows clicks on pins
  fire('mousedown', 480, box);
  fire('mouseup', 480, document);
  await wait(2500);
  let tried = 'none';
  for (let k = 0; k < 40 && !/Zalmedina/.test(name()); k++) {
    const me = document.querySelector('.me')?.getBoundingClientRect();
    const want = me && [...document.querySelectorAll('.mkw .mk')].find((q) => {
      const r = q.getBoundingClientRect();
      return Math.abs(r.x - me.x + 7) < 20 && Math.abs(r.y - me.y + 258) < 20 && r.y > 60 && r.y < 700;
    });
    if (want) {
      tried = 'clicked ' + k;
      want.click();
      await wait(1500);
    } else await wait(300);
  }
  if (/Zalmedina/.test(name())) return 'ok';
  for (let pass = 0; pass < 8; pass++) {
    const pins = [...document.querySelectorAll('.mkw .mk')];
    for (const p of pins) {
      p.click();
      await new Promise((r) => setTimeout(r, 700));
      seen.add(document.querySelector("[data-testid=nearest-name]")?.textContent);
      if (/Zalmedina/.test(document.querySelector('[data-testid=nearest-name]')?.textContent || '')) return 'ok';
    }
    // stops may still sit inside a cluster: open one so its pins show on the next pass
    document.querySelector('.mkw .mkc')?.click();
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Zalmedina pin not found, tried=" + tried + " seen: " + [...seen].join("|") + " n=" + document.querySelectorAll(".mkw .mk").length + " last: " + document.querySelector("[data-testid=nearest-name]")?.textContent);
})();
