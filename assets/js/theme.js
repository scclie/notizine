(function(){
  var t = localStorage.getItem('notizine-theme');
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (!t && matchMedia('(prefers-color-scheme:dark)').matches)
    document.documentElement.setAttribute('data-theme', 'dark');
  document.addEventListener('DOMContentLoaded',function(){
    var cb = document.getElementById('theme-dark');
    if(cb && document.documentElement.getAttribute('data-theme')==='dark') cb.checked=true;
  });
})();
