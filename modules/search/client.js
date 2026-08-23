const input = document.getElementById('search-input');
const box = document.getElementById('search-results');

function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return '';
  const start = Math.max(0, i - 60);
  const end = Math.min(text.length, i + q.length + 90);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

if (input && box) {
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.innerHTML = ''; return; }
      const idx = (window.SEARCH_INDEX || {})[input.dataset.locale] || [];
      const hits = [];
      for (const p of idx) {
        const hay = (p.t + '\n' + p.d + '\n' + p.x).toLowerCase();
        if (!hay.includes(q)) continue;
        const src = (p.d && p.d.toLowerCase().includes(q)) ? p.d : p.x;
        hits.push({ ...p, s: snippet(src, q) });
        if (hits.length >= 30) break;
      }
      box.innerHTML = hits.length
        ? hits.map(p =>
            `<article class="recent-row recent-row-block">` +
            `<div class="recent-row-head"><h2><a href="${p.u}">${p.t}</a></h2></div>` +
            (p.s ? `<p>${p.s}</p>` : '') +
            `</article>`
          ).join('')
        : `<article class="recent-row"><p>0</p></article>`;
    }, 80);
  });
}
