const input = document.querySelector('.theme-dark-input');
if (input) {
  input.checked = document.documentElement.getAttribute('data-theme') === 'dark';
  input.addEventListener('change', () => {
    localStorage.setItem('notizine-theme', input.checked ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', input.checked ? 'dark' : '');
  });
}
