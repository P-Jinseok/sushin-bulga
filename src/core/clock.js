// 모든 대기 시간을 관리하는 시계: 타이핑 지연, 제한시간, 연출 시간.
// - pause/resume: 탭 전환·화면 잠금 시 모든 대기를 멈춘다 (제한시간 포함).
// - speed: 텍스트 속도. scaled 대기(기본)에만 적용. 제한시간은 배속 영향 없음.
// - skip: 화면 탭으로 현재 대기를 건너뜀. skippable 대기(기본)에만 적용. 제한시간은 건너뛸 수 없음.
// 테스트에서는 now/setTimer/clearTimer를 가짜로 주입한다.

export function createClock({
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
} = {}) {
  const waits = new Set();
  let speed = 1;
  let paused = false;

  const factor = (w) => (w.scaled ? speed : 1);

  function schedule(w) {
    w.startedAt = now();
    w.handle = setTimer(() => finish(w, true), w.remaining / factor(w));
  }

  function unschedule(w) {
    if (w.handle == null) return;
    clearTimer(w.handle);
    w.handle = null;
    w.remaining = Math.max(0, w.remaining - (now() - w.startedAt) * factor(w));
  }

  function finish(w, completed) {
    if (!waits.has(w)) return;
    waits.delete(w);
    if (w.handle != null) clearTimer(w.handle);
    w.handle = null;
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort);
    w.resolve(completed);
  }

  function remainingOf(w) {
    if (!waits.has(w)) return 0;
    if (w.handle == null) return w.remaining;
    return Math.max(0, w.remaining - (now() - w.startedAt) * factor(w));
  }

  // 대기. 끝까지 기다리거나 skip되면 true, signal로 취소되면 false.
  // meter(선택): 객체를 주면 total(ms)과 remaining() 함수를 채운다 (제한시간 막대 표시용, 일시정지 반영).
  function wait(ms, { skippable = true, scaled = skippable, signal, meter } = {}) {
    return new Promise((resolve) => {
      const w = { remaining: Math.max(0, ms || 0), skippable, scaled, signal, resolve, handle: null };
      if (meter) {
        meter.total = w.remaining;
        meter.remaining = () => remainingOf(w);
      }
      if (signal?.aborted) return resolve(false);
      waits.add(w);
      if (signal) {
        w.onAbort = () => finish(w, false);
        signal.addEventListener('abort', w.onAbort);
      }
      if (!paused) schedule(w);
    });
  }

  return {
    wait,
    skip() {
      for (const w of [...waits]) if (w.skippable) finish(w, true);
    },
    pause() {
      if (paused) return;
      paused = true;
      for (const w of waits) unschedule(w);
    },
    resume() {
      if (!paused) return;
      paused = false;
      for (const w of waits) schedule(w);
    },
    setSpeed(next) {
      for (const w of waits) if (!paused) unschedule(w);
      speed = next > 0 ? next : 1;
      for (const w of waits) if (!paused) schedule(w);
    },
    get paused() {
      return paused;
    },
    get pending() {
      return waits.size;
    },
  };
}
