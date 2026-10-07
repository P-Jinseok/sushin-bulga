// 상단 알림 배너 (M2-6). 지금 보고 있지 않은 방에 메시지가 오거나 fx notify가 실행되면 잠깐 보여 준다.
// 탭하면 그 방으로 이동한다. 새 알림이 오면 내용을 바꾸고 표시 시간을 다시 센다.
// 표시 시간은 게임 시계(clock)가 아니라 실제 시간이다 (연출이 아니라 화면 안내이므로).

import { h } from './dom.js';

const SHOW_MS = 3500;

export function createBanner({ display, onOpen }) {
  let room = null;
  let timer = 0;
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
        const target = room;
        hide();
        if (target) onOpen(target);
      },
    },
    avatarSlot,
    h('span', { class: 'banner__body' }, name, text),
  );

  function hide() {
    clearTimeout(timer);
    el.hidden = true;
    room = null;
  }

  return {
    el,
    hide,
    get room() {
      return room;
    },
    show({ room: r, text: t }) {
      room = r;
      avatarSlot.replaceChildren(display.avatar(r, 'sm'));
      name.textContent = display.name(r);
      text.textContent = t;
      el.hidden = false;
      el.setAttribute('aria-label', `${display.name(r)}: ${t} (눌러서 대화방 열기)`);
      clearTimeout(timer);
      timer = setTimeout(hide, SHOW_MS);
    },
  };
}
