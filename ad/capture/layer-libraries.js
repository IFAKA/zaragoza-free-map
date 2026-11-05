// Fresh storage for the shot: Spanish, the "libraries" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'libraries');
  localStorage.setItem('zgz-consent', 'denied');
})();
