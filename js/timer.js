export function createMatchTimer(durationMs, onTick, onExpire) {
  let remaining = durationMs;
  let handle = null;
  let lastStart = null;

  function tick() {
    const now = Date.now();
    remaining -= now - lastStart;
    lastStart = now;
    if (remaining <= 0) {
      remaining = 0;
      stop();
      onTick(0);
      onExpire();
      return;
    }
    onTick(remaining);
  }

  function start() {
    if (handle !== null || remaining <= 0) return;
    lastStart = Date.now();
    handle = setInterval(tick, 500);
    onTick(remaining);
  }

  function pause() {
    if (handle === null) return;
    const now = Date.now();
    remaining -= now - lastStart;
    stop();
    onTick(Math.max(remaining, 0));
  }

  function reset() {
    stop();
    remaining = durationMs;
    onTick(remaining);
  }

  function stop() {
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
      lastStart = null;
    }
  }

  return {
    start,
    pause,
    reset,
    getRemaining: () => remaining,
    dispose: stop,
  };
}

export function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
