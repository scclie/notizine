document.addEventListener('click', ev => {
  const el = ev.target.closest('.random-note');
  if (!el) return;
  let urls = [];
  try { urls = JSON.parse(el.dataset.urls || '[]'); } catch { urls = []; }
  if (!urls.length) return;
  ev.preventDefault();
  location.href = urls[Math.floor(Math.random() * urls.length)];
});
