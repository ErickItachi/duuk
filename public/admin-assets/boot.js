// Applies the last chosen admin theme before the first paint, so the start screen never flashes.
try {
  var preference = localStorage.getItem('duuk-admin-theme:last')
  var light = preference === 'light' || (preference === 'system' && matchMedia('(prefers-color-scheme: light)').matches)
  if (light) document.documentElement.setAttribute('data-duuk-admin-theme', 'light')
} catch { /* Storage can be blocked; the dark start screen remains. */ }
