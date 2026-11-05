// Fresh storage for the shot: Spanish, the "wifi" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'wifi');
  localStorage.setItem('zgz-consent', 'denied');
})();
