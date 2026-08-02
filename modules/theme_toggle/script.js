(function() {
  var t = localStorage.getItem('notizine-theme');
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (!t && matchMedia('(prefers-color-scheme:dark)').matches)
    document.documentElement.setAttribute('data-theme', 'dark');
  var cb = document.getElementById('theme-dark');
  if (cb && localStorage.getItem('notizine-theme') === 'dark') cb.checked = true;
})();
