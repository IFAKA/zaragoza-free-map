// Opens the bus stop "Zalmedina" (a street corner; its times are served from capture/live/bus.json) by pressing its pin.
(async () => {
  const seen = new Set();
  for (let pass = 0; pass < 8; pass++) {
    const pins = [...document.querySelectorAll('.mkw .mk')];
    for (const p of pins) {
      p.click();
      await new Promise((r) => setTimeout(r, 700));
      seen.add(document.querySelector("[data-testid=nearest-name]")?.textContent);
      if (/Zalmedina/.test(document.querySelector('[data-testid=nearest-name]')?.textContent || '')) return 'ok';
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Zalmedina pin not found, seen: " + [...seen].join("|") + " n=" + document.querySelectorAll(".mkw .mk").length + " last: " + document.querySelector("[data-testid=nearest-name]")?.textContent);
})();
