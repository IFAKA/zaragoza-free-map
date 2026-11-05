// Fresh storage for the shot: Spanish, the "bizi" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'bizi');
  localStorage.setItem('zgz-consent', 'denied');
})();
