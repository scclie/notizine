(() => {
  const normalize = text => String(text ?? '').normalize('NFKC').toLowerCase();
  const index = window.SEARCH_INDEX;
  const available = index && typeof index === 'object' && !Array.isArray(index)
    && Object.values(index).every(Array.isArray);
  const seen = new Set();
  const pages = available ? Object.values(index).flat().filter(page => {
    if (!page || typeof page.u !== 'string' || !/^\/(?!\/)/.test(page.u)
      || /[\\\u0000-\u0020]/.test(page.u) || seen.has(page.u)) return false;
    seen.add(page.u);
    return true;
  }).map(page => ({
    title: String(page.t || page.u), url: page.u,
    description: String(page.d || ''), body: String(page.x || ''),
    searchable: normalize(`${page.t || ''}\n${page.d || ''}\n${page.x || ''}`),
  })) : [];

  function snippet(page, query) {
    const source = page.description || page.body;
    const match = query ? normalize(source).indexOf(query) : 0;
    const start = Math.max(0, match - 60);
    return (start ? '…' : '') + source.slice(start, start + 160).trim()
      + (source.length > start + 160 ? '…' : '');
  }

  for (const widget of document.querySelectorAll('.search-widget')) {
    const input = widget.querySelector('.search-input');
    const box = widget.querySelector('.search-results');
    if (!input || !box) continue;
    function render() {
      const query = normalize(input.value.trim());
      const hits = pages.filter(page => !query || page.searchable.includes(query));
      const fragment = document.createDocumentFragment();
      if (!available || !hits.length) {
        const message = document.createElement('p');
        message.textContent = available ? widget.dataset.empty : widget.dataset.unavailable;
        fragment.append(message);
      } else {
        for (const page of hits) {
          const article = document.createElement('article');
          article.className = 'recent-row recent-row-block';
          const head = document.createElement('div');
          head.className = 'recent-row-head';
          const title = document.createElement('h2');
          const link = document.createElement('a');
          link.href = page.url;
          link.textContent = page.title;
          title.append(link);
          head.append(title);
          article.append(head);
          const preview = snippet(page, query);
          if (preview) {
            const text = document.createElement('p');
            text.textContent = preview;
            article.append(text);
          }
          fragment.append(article);
        }
      }
      box.replaceChildren(fragment);
    }
    input.addEventListener('input', render);
    render();
  }
})();
