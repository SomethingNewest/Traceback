export function announce(message) {
  const region = document.querySelector('#announcer');
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
