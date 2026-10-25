import { announce } from './ui/announcements.js';

export function parseRoute(hash) {
  const path = hash.replace(/^#/, '') || '/home';
  const activity = /^\/activity\/(trace|tap|aim|hold|sequence|memory|choice)$/.exec(path);
  if (activity) return { page: 'activity', activityId: activity[1] };
  if (/^\/(home|activities|progress|report|settings|about|information|routines)$/.test(path))
    return { page: path.slice(1) };
  return { page: 'not-found' };
}

export function createRouter(render, { beforeLeave = async () => true } = {}) {
  let cleanup = () => {};
  let currentHash = null;
  let transition = 0;
  let disposed = false;
  const navigate = async () => {
    if (disposed) return;
    const nextHash = location.hash;
    const version = ++transition;
    if (currentHash !== null && nextHash !== currentHash) {
      const leave = await beforeLeave();
      if (disposed || version !== transition) return;
      if (!leave) {
        history.replaceState(null, '', currentHash || '#/home');
        return;
      }
    }
    cleanup();
    currentHash = nextHash;
    const route = parseRoute(location.hash);
    const rendered = render(route);
    cleanup = rendered.cleanup ?? (() => {});
    document.title = `${rendered.title} · TraceBack`;
    document.querySelectorAll('[data-nav]').forEach((link) => {
      const active = link.dataset.nav === (route.page === 'activity' ? 'activities' : route.page);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const heading = document.querySelector('main h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
    announce(rendered.title);
  };
  window.addEventListener('hashchange', navigate);
  navigate();
  return () => {
    disposed = true;
    transition++;
    cleanup();
    window.removeEventListener('hashchange', navigate);
  };
}
