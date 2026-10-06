// M2-1 화면 목업 (?mock=1 로 열람). 더미 데이터로 방 목록·대화방·선택지·상단 상태를 보여 준다.
// 엔진과 연결하지 않는다 (M2-4에서 chat-view 등으로 대체). 대사는 레이아웃 확인용 더미다.

import { createAvatar } from './avatar.js';
import { h } from './dom.js';

const ROOMS = [
  { id: 'j', last: '[더미] 마지막 메시지 미리보기', time: '23:12', unread: 2 },
  { id: 'harin', last: '[더미] 안녕하세요, 레이아웃 확인용 문장이에요', time: '10:15', unread: 0 },
  { id: 'nayeon', last: '[더미] 짧은 문장.', time: '어제', unread: 1 },
  { id: 'chaerin', last: '[더미] 이모티콘 표시 확인 ㅎㅎ~', time: '어제', unread: 0 },
  { id: 'sera', last: '[더미] 긴 미리보기가 한 줄을 넘으면 말줄임표로 잘리는지 확인하는 문장', time: '월', unread: 0 },
];

const MESSAGES = [
  { kind: 'day', text: '월요일' },
  { kind: 'other', speaker: 'j', text: '[더미] 상대 말풍선입니다.', time: '23:07' },
  { kind: 'other', speaker: 'j', text: '[더미] 연속 메시지는 아바타와 이름을 생략합니다.', time: '23:07', cont: true },
  { kind: 'me', text: '[더미] 도하가 보낸 메시지 (읽음)', time: '23:08' },
  { kind: 'other', speaker: 'j', text: '[더미] 아주 긴 말풍선이 화면 폭을 넘지 않고 줄바꿈되는지 확인하기 위한 문장입니다. 두 번째 문장까지 들어갑니다.', time: '23:09' },
  { kind: 'other', speaker: 'j', deleted: true, time: '23:09', cont: true },
  { kind: 'system', text: '[더미] 시스템 문구 (가운데 정렬)' },
  { kind: 'day', text: '화요일' },
  { kind: 'me', text: '[더미] 안 읽은 메시지 (1 표시)', time: '09:30', unread: true },
  { kind: 'me', text: '[더미] 전송 실패 표시', time: '09:31', failed: true },
  { kind: 'typing', speaker: 'j' },
];

const CHOICES = [
  { text: '[더미] 선택지 1 — 신중한 답변' },
  { text: '[더미] 선택지 2 — 두 줄로 넘어갈 만큼 조금 더 긴 선택지 문장' },
  { text: '[더미] 잠긴 선택지', disabled: true, hint: '잠긴 선택지 힌트 (lockedHint)' },
];

function statusbar(time, battery) {
  const level = h('span', { class: 'battery__level' });
  level.style.width = `calc(${battery}% - 2px)`;
  return h(
    'div',
    { class: 'statusbar' },
    h('span', {}, time),
    h('span', { class: 'statusbar__battery' }, h('span', {}, `${battery}%`), h('span', { class: 'battery' + (battery <= 20 ? ' battery--low' : ''), 'aria-hidden': 'true' }, level)),
  );
}

const nameOf = (c) => c.displayName ?? c.name;

function roomListScreen(chars, onOpen) {
  return h(
    'section',
    { class: 'screen', id: 'screen-rooms', 'aria-label': '대화방 목록' },
    statusbar('23:12', 64),
    h('header', { class: 'list-header' }, '채팅'),
    h(
      'ul',
      { class: 'room-list' },
      ROOMS.map((r) => {
        const c = chars.get(r.id);
        return h(
          'li',
          {},
          h(
            'button',
            { class: 'room', type: 'button', onclick: () => onOpen(r.id) },
            createAvatar(c),
            h('span', { class: 'room__body' }, h('div', { class: 'room__name' }, nameOf(c)), h('div', { class: 'room__last' }, r.last)),
            h('span', { class: 'room__meta' }, h('span', {}, r.time), r.unread ? h('span', { class: 'badge' }, String(r.unread)) : null),
          ),
        );
      }),
    ),
  );
}

function messageEl(m, chars) {
  switch (m.kind) {
    case 'day':
      return h('div', { class: 'day-divider', role: 'separator' }, m.text);
    case 'system':
      return h('div', { class: 'system-msg' }, m.text);
    case 'me':
      return h(
        'div',
        { class: 'msg msg--me' },
        h('div', { class: 'bubble' }, m.text),
        h(
          'div',
          { class: 'msg__side' },
          m.failed ? h('span', { class: 'send-fail', title: '전송 실패' }, '!') : m.unread ? h('span', { class: 'unread' }, '1') : null,
          h('span', {}, m.time),
        ),
      );
    case 'typing':
    case 'other': {
      const c = chars.get(m.speaker);
      const bubble =
        m.kind === 'typing'
          ? h('div', { class: 'bubble typing', 'aria-label': '입력 중' }, h('span'), h('span'), h('span'))
          : h('div', { class: 'bubble' + (m.deleted ? ' bubble--deleted' : '') }, m.deleted ? '삭제된 메시지입니다' : m.text);
      return h(
        'div',
        { class: 'msg msg--other' },
        h('div', { class: 'avatar-slot' }, m.cont ? null : createAvatar(c, { size: 'sm' })),
        h('div', { class: 'msg__col' }, m.cont ? null : h('div', { class: 'msg__name' }, nameOf(c)), bubble),
        m.time ? h('div', { class: 'msg__side' }, h('span', {}, m.time)) : null,
      );
    }
  }
  return null;
}

function chatScreen(chars, roomId, onBack) {
  const c = chars.get(roomId);
  const fill = h('div', { class: 'timer-bar__fill' });
  fill.style.width = '60%';
  return h(
    'section',
    { class: 'screen', id: 'screen-chat', 'aria-label': '대화방' },
    statusbar('09:31', 18),
    h(
      'header',
      { class: 'chat-header' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '뒤로', onclick: onBack }, '‹'),
      createAvatar(c, { size: 'sm' }),
      h('div', { class: 'chat-header__name' }, nameOf(c)),
    ),
    h('div', { class: 'messages', role: 'log' }, MESSAGES.map((m) => messageEl(m, chars))),
    h(
      'div',
      { class: 'choices', role: 'group', 'aria-label': '선택지' },
      h('div', { class: 'timer-bar', 'aria-hidden': 'true' }, fill),
      CHOICES.map((o) =>
        h('button', { class: 'choice', type: 'button', disabled: o.disabled }, o.text, o.hint ? h('span', { class: 'choice__hint' }, o.hint) : null),
      ),
    ),
  );
}

export function renderMock(app, charactersData) {
  const chars = new Map(charactersData.characters.map((c) => [c.id, c]));
  const show = (screen) => app.replaceChildren(screen);
  const openList = () => show(roomListScreen(chars, openRoom));
  const openRoom = (id) => {
    show(chatScreen(chars, id, openList));
    const list = app.querySelector('.messages');
    list.scrollTop = list.scrollHeight;
  };
  // URL 해시로 시작 화면 지정 (#chat → 대화방). 스크린샷·실기기 확인용.
  if (location.hash === '#chat') openRoom('j');
  else openList();
}
