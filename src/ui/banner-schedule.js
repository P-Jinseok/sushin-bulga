// 알림 배너 표시 시간 규칙 (DEC-060). DOM 없음 → node --test로 검증.
// - 한 번 뜬 배너는 최소 MIN_MS(3초) 보인다. 자동으로는 SHOW_MS(3.5초) 뒤 사라진다.
// - 새 배너가 오면 이전 배너를 대체하되, 이전 배너가 최소 OVERLAP_MIN_MS(1초)는 보인 뒤에 바꾼다.
//   기다리는 동안 또 새 배너가 오면 가장 최근 것만 남긴다.
// - hide()는 즉시 닫는다 (배너를 직접 탭하거나 그 방을 연 경우). 대기 중인 배너가 있으면 그것을 띄운다.
// 시간은 게임 시계가 아니라 실제 시간이다 (연출이 아니라 화면 안내이므로).

export const MIN_MS = 3000;
export const SHOW_MS = 3500;
export const OVERLAP_MIN_MS = 1000;

export function createBannerSchedule({ render, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let current = null; // 보이는 내용
  let shownAt = 0;
  let pending = null; // 이전 배너 1초를 기다리는 내용
  let hideTimer = null;
  let swapTimer = null;

  function apply(content) {
    clearTimer(hideTimer);
    current = content;
    shownAt = now();
    render(content);
    hideTimer = setTimer(() => close(), SHOW_MS);
  }

  function close() {
    clearTimer(hideTimer);
    clearTimer(swapTimer);
    hideTimer = swapTimer = null;
    if (pending) {
      const next = pending;
      pending = null;
      return apply(next);
    }
    current = null;
    render(null);
  }

  return {
    show(content) {
      const age = now() - shownAt;
      if (current && age < OVERLAP_MIN_MS) {
        pending = content;
        if (!swapTimer)
          swapTimer = setTimer(() => {
            swapTimer = null;
            const next = pending;
            pending = null;
            if (next) apply(next);
          }, OVERLAP_MIN_MS - age);
        return;
      }
      apply(content);
    },
    hide: close,
    get current() {
      return current;
    },
    get pending() {
      return pending;
    },
    // 최소 표시 시간까지 남은 ms (보이는 배너가 없으면 0)
    minRemaining() {
      return current ? Math.max(0, MIN_MS - (now() - shownAt)) : 0;
    },
  };
}
