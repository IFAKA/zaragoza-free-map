// Fresh storage for the shot: Spanish, water layer, no consent banner, no install toast.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'charge');
  localStorage.setItem('zgz-consent', 'denied');
})();
