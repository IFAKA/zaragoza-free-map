// Fresh storage for the shot: Spanish, the "bus" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'bus');
  localStorage.setItem('zgz-consent', 'denied');
})();
