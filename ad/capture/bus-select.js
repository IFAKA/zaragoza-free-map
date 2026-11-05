// Opens the bus stop "Zalmedina" (a street corner; its times are served from capture/live/bus.json) by pressing its pin.
(async () => {
  for (let pass = 0; pass < 3; pass++) {
    const pins = [...document.querySelectorAll('.mkw .mk')];
    for (const p of pins) {
      p.click();
      await new Promise((r) => setTimeout(r, 700));
      if (/Zalmedina/.test(document.querySelector('[data-testid=nearest-name]')?.textContent || '')) return 'ok';
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return 'not found';
})();
