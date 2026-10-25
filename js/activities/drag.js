import { DRAG_ROUNDS, isPrimaryActivation, withinInterval } from './protocol.js';
import { scoreDrag } from '../metrics/scoring.js';
import { bindInputReset } from './extra-protocol.js';

export function mountDrag(scope) {
  const surface = scope.surface;
  const signal = scope.signal;
  const tile = surface.querySelector('.drag-tile');
  const zone = surface.querySelector('.drop-zone');

  let pointerType = scope.pointerType;
  if (pointerType === undefined || pointerType === null) {
    pointerType = 'mouse';
  }

  const bounds = surface.getBoundingClientRect();
  let width = bounds.width;
  let height = bounds.height;
  let tileSize = Math.min(scope.largerTargets ? 72 : 56, width / 3);
  let zoneSize = Math.min(scope.largerTargets ? 128 : 104, width * 0.42);
  const durationMs = 30000;
  const startedAt = scope.now();
  const dropAttempts = [];

  let round = 0;
  let score = 0;
  let misses = 0;
  let activePointer = null;
  let appearedAt = startedAt;
  let center = null;
  let destination = null;
  let offset = null;
  let pickup = null;
  let moved = false;
  let finished = false;

  function pointFromEvent(event) {
    const rect = surface.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function releaseTile() {
    const id = activePointer;
    activePointer = null;
    tile.dataset.dragging = 'false';
    if (id !== null && surface.hasPointerCapture(id)) {
      surface.releasePointerCapture(id);
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    releaseTile();
    tile.hidden = true;
    zone.hidden = true;
    const result = scoreDrag(dropAttempts, { durationMs: durationMs });
    scope.complete({
      metrics: result.metrics,
      quality: result.quality,
      durationMs: durationMs,
      pointerType: pointerType,
    });
  }

  function updateFeedback() {
    scope.feedback(score + ' points - ' + round + ' placed - ' + misses + ' misses');
  }

  function placeTile() {
    tile.style.left = center.x + 'px';
    tile.style.top = center.y + 'px';
  }

  function resetTileToStart() {
    const size = surface.getBoundingClientRect();
    const config = DRAG_ROUNDS[round % DRAG_ROUNDS.length];
    center = { x: config.from.x * size.width, y: config.from.y * size.height };
  }

  function showRound() {
    const size = surface.getBoundingClientRect();
    const config = DRAG_ROUNDS[round % DRAG_ROUNDS.length];
    center = { x: config.from.x * size.width, y: config.from.y * size.height };
    destination = { x: config.to.x * size.width, y: config.to.y * size.height };

    tile.style.width = tileSize + 'px';
    tile.style.height = tileSize + 'px';
    zone.style.width = zoneSize + 'px';
    zone.style.height = zoneSize + 'px';
    zone.style.left = destination.x + 'px';
    zone.style.top = destination.y + 'px';

    tile.dataset.round = String(round + 1);
    zone.dataset.round = String(round + 1);
    tile.setAttribute('aria-label', 'Tile ' + (round + 1) + '. Drag it into the outline.');
    tile.dataset.dragging = 'false';
    zone.dataset.ready = 'false';
    placeTile();
    appearedAt = scope.now();
    updateFeedback();
  }

  // is the whole tile inside the outline?
  function tileFits() {
    const slack = (zoneSize - tileSize) / 2;
    return (
      Math.abs(center.x - destination.x) <= slack && Math.abs(center.y - destination.y) <= slack
    );
  }

  function moveTile(event) {
    updateGeometry();
    const p = pointFromEvent(event);
    const size = surface.getBoundingClientRect();
    if (!moved) {
      moved = Math.hypot(p.x - pickup.x, p.y - pickup.y) >= 6;
    }
    const half = tileSize / 2;
    center = {
      x: Math.max(half, Math.min(size.width - half, p.x - offset.x)),
      y: Math.max(half, Math.min(size.height - half, p.y - offset.y)),
    };
    placeTile();
    zone.dataset.ready = String(moved && tileFits());
  }

  function updateGeometry() {
    const size = surface.getBoundingClientRect();
    if (size.width <= 0 || size.height <= 0) return;
    if (size.width === width && size.height === height) return;

    const scaleX = size.width / width;
    const scaleY = size.height / height;
    center = { x: center.x * scaleX, y: center.y * scaleY };
    destination = { x: destination.x * scaleX, y: destination.y * scaleY };
    if (offset) offset = { x: offset.x * scaleX, y: offset.y * scaleY };
    if (pickup) pickup = { x: pickup.x * scaleX, y: pickup.y * scaleY };
    width = size.width;
    height = size.height;
    tileSize = Math.min(scope.largerTargets ? 72 : 56, width / 3);
    zoneSize = Math.min(scope.largerTargets ? 128 : 104, width * 0.42);
    tile.style.width = tile.style.height = tileSize + 'px';
    zone.style.width = zone.style.height = zoneSize + 'px';
    zone.style.left = destination.x + 'px';
    zone.style.top = destination.y + 'px';
    placeTile();
    zone.dataset.ready = String(moved && tileFits());
  }

  function isActivePointer(event) {
    return (
      event.pointerId === activePointer && event.pointerType === pointerType && event.isPrimary
    );
  }

  showRound();
  scope.status('Place tiles for 30 seconds. +100 points for a fit. -25 for a miss.');
  scope.timer('30s left');

  surface.addEventListener(
    'pointerdown',
    function (event) {
      if (!withinInterval(scope.now(), startedAt, durationMs)) {
        finish();
        return;
      }
      if (finished || activePointer !== null) return;
      if (!isPrimaryActivation(event, pointerType)) return;
      if (!event.target.closest || !event.target.closest('.drag-tile')) return;

      event.preventDefault();
      updateGeometry();
      activePointer = event.pointerId;
      pickup = pointFromEvent(event);
      offset = { x: pickup.x - center.x, y: pickup.y - center.y };
      moved = false;
      tile.dataset.dragging = 'true';
      surface.setPointerCapture(event.pointerId);
    },
    { signal: signal },
  );

  surface.addEventListener(
    'pointermove',
    function (event) {
      if (!withinInterval(scope.now(), startedAt, durationMs)) {
        finish();
        return;
      }
      if (!isActivePointer(event)) return;
      if (['mouse', 'pen'].includes(pointerType) && event.buttons === 0) {
        cancelDrag(event);
        return;
      }
      event.preventDefault();
      moveTile(event);
    },
    { signal: signal },
  );

  surface.addEventListener(
    'pointerup',
    function (event) {
      if (!withinInterval(scope.now(), startedAt, durationMs)) {
        finish();
        return;
      }
      if (finished || !isActivePointer(event)) return;

      event.preventDefault();
      moveTile(event);
      releaseTile();

      const p = pointFromEvent(event);
      const time = scope.now();
      const droppedInside =
        Math.abs(p.x - destination.x) <= zoneSize / 2 &&
        Math.abs(p.y - destination.y) <= zoneSize / 2;
      const hit = moved && tileFits() && droppedInside;
      dropAttempts.push({ hit: hit, appearedAt: appearedAt, selectedAt: time });

      if (hit) {
        round++;
        score += 100;
        showRound();
      } else {
        misses++;
        score = Math.max(0, score - 25);
        // put the tile back where it started
        resetTileToStart();
        placeTile();
        zone.dataset.ready = 'false';
        updateFeedback();
      }
    },
    { signal: signal },
  );

  function cancelDrag(event) {
    if (activePointer === null || event.pointerId !== activePointer) return;
    releaseTile();
    updateGeometry();
    moved = false;
    resetTileToStart();
    placeTile();
    zone.dataset.ready = 'false';
    updateFeedback();
  }
  surface.addEventListener('pointercancel', cancelDrag, { signal: signal });
  surface.addEventListener('lostpointercapture', cancelDrag, { signal: signal });
  bindInputReset(scope, () => cancelDrag({ pointerId: activePointer }));

  scope.frame(function (time) {
    if (finished) return;
    updateGeometry();
    const remaining = Math.max(0, Math.min(durationMs, durationMs - (time - startedAt)));
    scope.timer(Math.ceil(remaining / 1000) + 's left');
    if (remaining === 0) {
      finish();
    }
  });
}
