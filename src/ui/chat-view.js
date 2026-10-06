// 대화방 화면: 상단바, 말풍선 목록(날짜 구분선·읽음 1·삭제·전송 실패), 입력 중 표시, 자동 스크롤.
// 선택지 영역(choiceArea)은 choice-view가 채운다.

import { h, createStatusbar } from './dom.js';

const NEAR_BOTTOM = 80; // px. 이 안쪽이면 "맨 아래를 보고 있음"으로 본다

export function createChatView({ display, onBack, onSkip }) {
  const status = createStatusbar();
  const avatarSlot = h('span', { class: 'chat-header__avatar' });
  const title = h('div', { class: 'chat-header__name' });
  const header = h(
    'header',
    { class: 'chat-header' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '대화방 목록으로', onclick: onBack }, '‹'),
    avatarSlot,
    title,
  );
  const list = h('div', { class: 'messages', role: 'log', 'aria-live': 'polite' });
  const newBtn = h('button', { class: 'new-msg', type: 'button', hidden: true, onclick: () => scrollToBottom() }, '새 메시지 ↓');
  const choiceArea = h('div', { class: 'choices', role: 'group', 'aria-label': '선택지', hidden: true });
  const el = h('section', { class: 'screen', 'aria-label': '대화방' }, status.el, header, h('div', { class: 'messages-wrap' }, list, newBtn), choiceArea);

  const parts = new WeakMap(); // item → { side, bubble }
  let roomId = null;
  let lastItem = null;
  let typingEl = null;

  // 화면 탭 = 현재 대기 건너뛰기 (스크롤은 click을 만들지 않으므로 방해하지 않음)
  list.addEventListener('click', () => onSkip?.());
  list.addEventListener('scroll', () => {
    if (isNearBottom()) newBtn.hidden = true;
  });

  function isNearBottom() {
    return list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM;
  }

  function scrollToBottom() {
    list.scrollTop = list.scrollHeight;
    newBtn.hidden = true;
  }

  // 새 내용을 넣기 전에 위치를 재고, 넣은 뒤 맨 아래였으면 따라 내려간다.
  // 위로 올려 읽는 중이면 강제 스크롤하지 않고 "새 메시지" 버튼만 띄운다.
  function withAutoScroll(fn, { notify = true } = {}) {
    const near = isNearBottom();
    fn();
    if (near) scrollToBottom();
    else if (notify) newBtn.hidden = false;
  }

  function renderItem(item, prev) {
    if (item.kind === 'system') return h('div', { class: 'system-msg' }, item.text);

    const side = h('div', { class: 'msg__side' });
    const bubble = h('div', { class: 'bubble' }, item.text);
    parts.set(item, { side, bubble });
    updateMarkers(item);

    if (item.kind === 'me') return h('div', { class: 'msg msg--me' }, bubble, side);

    const cont = prev && prev.kind === 'other' && prev.speaker === item.speaker && prev.day === item.day;
    return h(
      'div',
      { class: 'msg msg--other' },
      h('div', { class: 'avatar-slot' }, cont ? null : display.avatar(item.speaker, 'sm')),
      h('div', { class: 'msg__col' }, cont ? null : h('div', { class: 'msg__name' }, display.name(item.speaker)), bubble),
      side,
    );
  }

  function updateMarkers(item) {
    const p = parts.get(item);
    if (!p) return;
    const e = item.entry;
    const marks = [];
    if (item.kind === 'me') {
      if (e.failed) marks.push(h('span', { class: 'send-fail', title: '전송 실패' }, '!'));
      else if (e.read === false) marks.push(h('span', { class: 'unread', 'aria-label': '안 읽음' }, '1'));
    }
    if (item.time) marks.push(h('span', {}, item.time));
    p.side.replaceChildren(...marks);
    if (e.deleted) {
      p.bubble.textContent = '삭제된 메시지입니다';
      p.bubble.classList.add('bubble--deleted');
    }
  }

  function appendItem(item) {
    if (item.day && item.day !== lastItem?.day) list.insertBefore(h('div', { class: 'day-divider', role: 'separator' }, item.day), typingEl);
    list.insertBefore(renderItem(item, lastItem), typingEl);
    lastItem = item;
  }

  return {
    el,
    choiceArea,
    status,
    get roomId() {
      return roomId;
    },

    // 방 전체를 다시 그린다 (방에 들어올 때, 연락처 이름이 바뀌었을 때)
    show(room) {
      roomId = room.id;
      avatarSlot.replaceChildren(display.avatar(room.id, 'sm'));
      title.textContent = display.name(room.id);
      list.replaceChildren();
      lastItem = null;
      typingEl = null;
      for (const item of room.items) appendItem(item);
      this.setTyping(room.typing);
      scrollToBottom();
    },

    append(item) {
      withAutoScroll(() => appendItem(item));
    },

    setTyping(speaker) {
      withAutoScroll(
        () => {
          typingEl?.remove();
          typingEl = null;
          if (!speaker) return;
          typingEl = h(
            'div',
            { class: 'msg msg--other' },
            h('div', { class: 'avatar-slot' }, lastItem?.kind === 'other' && lastItem.speaker === speaker ? null : display.avatar(speaker, 'sm')),
            h('div', { class: 'bubble typing', 'aria-label': `${display.name(speaker)} 입력 중` }, h('span'), h('span'), h('span')),
          );
          list.append(typingEl);
        },
        { notify: false },
      );
    },

    // 읽음·삭제·전송 실패 표시 갱신
    refreshMarkers(room) {
      for (const item of room.items) updateMarkers(item);
    },

    appendCard(node) {
      withAutoScroll(() => list.insertBefore(node, typingEl));
    },

    // 선택지 영역처럼 메시지 목록 높이를 바꾸는 변경: 맨 아래를 보고 있었다면 맨 아래를 유지한다
    keepBottom(fn) {
      withAutoScroll(fn, { notify: false });
    },

    scrollToBottom,
  };
}
