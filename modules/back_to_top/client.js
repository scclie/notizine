document.querySelectorAll('.back-to-top').forEach(el => {
  el.addEventListener('click', ev => {
    ev.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
