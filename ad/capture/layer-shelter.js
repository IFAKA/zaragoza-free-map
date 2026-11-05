// Fresh storage for the shot: Spanish, the "shelter" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'shelter');
  localStorage.setItem('zgz-consent', 'denied');
})();
