// 선택지 영역: 선택지 버튼(잠긴 선택지는 회색 + lockedHint), 제한시간 막대, 다른 방 답장 대기 안내.

import { h } from './dom.js';

export function createChoiceView(area) {
  let raf = 0;

  function stopTimer() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function clear() {
    stopTimer();
    area.replaceChildren();
    area.hidden = true;
  }

  return {
    clear,

    // view: runner가 준 { options[{index,text,enabled,hint}], timer, meter }. onPick(index)
    // onTick(sec): 제한시간 마지막 5초 동안 남은 초가 바뀔 때마다 (효과음 timer_tick, 지시서 #20)
    show(view, onPick, { onTick } = {}) {
      clear();
      let picked = false;
      const buttons = view.options.map((o) =>
        h(
          'button',
          {
            class: 'choice',
            type: 'button',
            disabled: !o.enabled,
            'aria-disabled': !o.enabled ? 'true' : null,
            onclick: () => {
              if (picked || !o.enabled) return;
              picked = true; // 연타 방지
              buttons.forEach((b) => (b.disabled = true));
              onPick(o.index);
            },
          },
          o.text,
          !o.enabled && o.hint ? h('span', { class: 'choice__hint' }, o.hint) : null,
        ),
      );

      if (view.timer > 0) {
        // 막대 + 남은 초. 선택지가 많아 이 영역이 스크롤되어도 위에 붙어 있고, 줄어들어 사라지지 않는다 (DEC-058 조사)
        const fill = h('div', { class: 'timer-bar__fill' });
        const label = h('span', { class: 'timer-bar__label' }, `남은 시간 ${view.timer}초`);
        area.append(h('div', { class: 'timer', role: 'timer', 'aria-label': `제한시간 ${view.timer}초` }, h('div', { class: 'timer-bar' }, fill), label));
        // 막대는 clock의 남은 시간을 그대로 그린다 (탭 전환·잠금 중에는 clock이 멈추므로 막대도 멈춤)
        let lastSec = -1;
        const tick = () => {
          const m = view.meter;
          if (m?.remaining && m.total) {
            const left = m.remaining();
            fill.style.width = `${(100 * left) / m.total}%`;
            const sec = Math.ceil(left / 1000);
            if (sec !== lastSec) {
              label.textContent = `남은 시간 ${(lastSec = sec)}초`;
              if (sec > 0 && sec <= 5) onTick?.(sec);
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      }
      area.append(...buttons);
      area.hidden = false;
    },

    // 선택지가 다른 방에 있을 때
    showWaiting(text, onGo) {
      clear();
      area.append(h('button', { class: 'choice choice--waiting', type: 'button', onclick: onGo }, text));
      area.hidden = false;
    },

    showButton(text, onClick) {
      clear();
      area.append(h('button', { class: 'choice', type: 'button', onclick: onClick }, text));
      area.hidden = false;
    },
  };
}
