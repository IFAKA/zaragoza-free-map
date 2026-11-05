// Presses the pin a user would tap on the current layer (by its title), as a tap does: the card of that place opens.
(async () => {
  const titles = {bus: 'Arquitecto La Figuera / Zalmedina', tram: 'Plaza del Pilar - Murallas', bizi: '9-Echegaray. Pte. Piedra'};
  const want = titles[localStorage.getItem('zgz:v2:layer')];
  for (let k = 0; k < 40; k++) {
    const pin = [...document.querySelectorAll('.mkw')].find((w) => w.getAttribute('title') === want)?.querySelector('.mk');
    if (pin) { pin.click(); await new Promise((r) => setTimeout(r, 1500)); return 'ok'; }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('pin not found: ' + want);
})();
