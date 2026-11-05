// Fresh storage for the shot: Spanish, the "charge" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'charge');
  localStorage.setItem('zgz-consent', 'denied');
})();
