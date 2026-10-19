// Applies the saved theme before first paint so the app never flashes the wrong colors.
(function () {
  try {
    var t = localStorage.getItem('bankai-theme') || 'dark';
    var a = localStorage.getItem('bankai-accent');
    if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    if (a) document.documentElement.dataset.accent = a;
  } catch (e) { /* storage blocked: defaults apply */ }
})();
