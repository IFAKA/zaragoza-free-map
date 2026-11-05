// Fresh storage for the shot: Spanish, the "tram" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'tram');
  localStorage.setItem('zgz-consent', 'denied');
})();
