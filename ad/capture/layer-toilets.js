// Fresh storage for the shot: Spanish, the "toilets" service, no consent banner.
(() => {
  localStorage.clear();
  localStorage.setItem('zgz:v2:lang', 'es');
  localStorage.setItem('zgz:v2:layer', 'toilets');
  localStorage.setItem('zgz-consent', 'denied');
})();
