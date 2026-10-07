// 상단 알림 배너 (M2-6, DEC-060). 지금 보고 있지 않은 방에 메시지가 오거나 fx notify가 실행되면 보여 준다.
// 배너를 탭하면 그 방으로 바로 이동한다. 표시 시간 규칙은 banner-schedule.js (최소 3초, 대체 전 최소 1초).

import { h } from './dom.js';
import { createBannerSchedule } from './banner-schedule.js';

export function createBanner({ display, onOpen }) {
  const avatarSlot = h('span', { class: 'banner__avatar' });
  const name = h('span', { class: 'banner__name' });
  const text = h('span', { class: 'banner__text' });
  const el = h(
    'button',
    {
      class: 'banner',
      type: 'button',
      hidden: true,
      'aria-live': 'polite',
      onclick: () => {
        const target = schedule.current?.room;
        schedule.hide();
        if (target) onOpen(target);
      },
    },
    avatarSlot,
    h('span', { class: 'banner__body' }, name, text),
  );

  const schedule = createBannerSchedule({
    render(content) {
      if (!content) {
        el.hidden = true;
        return;
      }
      avatarSlot.replaceChildren(display.avatar(content.room, 'sm'));
      name.textContent = display.name(content.room);
      text.textContent = content.text;
      el.setAttribute('aria-label', `${display.name(content.room)}: ${content.text} (눌러서 대화방 열기)`);
      el.hidden = false;
    },
  });

  return {
    el,
    show: (content) => schedule.show(content),
    hide: () => schedule.hide(),
    get room() {
      return schedule.current?.room ?? null;
    },
    // 최소 표시 시간(3초)이 남아 있는 동안은 true → 화면 탭 건너뛰기를 막는다
    get holding() {
      return schedule.minRemaining() > 0;
    },
    minRemaining: () => schedule.minRemaining(),
  };
}
