// Presses the pin a user would tap on the current layer (by its title), as a tap does: the card of that place opens.
// Synchronous: it runs while the page clock is stopped for filming.
(() => {
  const titles = {bus: 'Don Jaime I / Plaza De La Seo', tram: 'Plaza del Pilar - Murallas', bizi: '9-Echegaray. Pte. Piedra'};
  const want = titles[localStorage.getItem('zgz:v2:layer')];
  const pin = [...document.querySelectorAll('.mkw')].find((w) => w.getAttribute('title') === want)?.querySelector('.mk');
  if (!pin) throw new Error('pin not found: ' + want);
  pin.click();
})();
