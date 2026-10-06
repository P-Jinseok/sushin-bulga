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
    show(view, onPick) {
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
        const fill = h('div', { class: 'timer-bar__fill' });
        area.append(h('div', { class: 'timer-bar', role: 'timer', 'aria-label': `제한시간 ${view.timer}초` }, fill));
        // 막대는 clock의 남은 시간을 그대로 그린다 (탭 전환·잠금 중에는 clock이 멈추므로 막대도 멈춤)
        const tick = () => {
          const m = view.meter;
          if (m?.remaining && m.total) fill.style.width = `${(100 * m.remaining()) / m.total}%`;
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
