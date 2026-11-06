// Brings the line chip fully into the drawer's view (the card list sits a few pixels under the phone's edge), so its tap ring is on screen.
(() => {
  const c = document.querySelector('[data-testid=bus-line-chip][data-line="35"]');
  if (c) c.scrollIntoView({block: 'nearest', behavior: 'smooth'});
})();
