// 대화방 목록. 대화 기록이 있거나 답장을 기다리는 방만 최근 순으로 보여 준다
// (아직 연락이 없는 인물이 목록에 미리 드러나지 않게).
// 알림 배너·목록 확장 기능은 M2-6.

import { h, createStatusbar } from './dom.js';

export function createRoomList({ display, onOpen }) {
  const status = createStatusbar();
  const ul = h('ul', { class: 'room-list' });
  const empty = h('p', { class: 'room-list__empty', hidden: true }, '아직 대화가 없습니다.');
  const el = h('section', { class: 'screen', 'aria-label': '대화방 목록' }, status.el, h('header', { class: 'list-header' }, '채팅'), ul, empty);

  return {
    el,
    status,
    // rooms: presenter의 방 모델 배열, waitingRoom: 선택지를 기다리는 방 id
    render(rooms, waitingRoom) {
      const visible = rooms.filter((r) => r.items.length || r.id === waitingRoom).sort((a, b) => b.seq - a.seq);
      empty.hidden = visible.length > 0;
      ul.replaceChildren(
        ...visible.map((r) => {
          const last = [...r.items].reverse().find((i) => i.kind !== 'system') ?? r.items.at(-1);
          const preview = last ? (last.entry.deleted ? '삭제된 메시지입니다' : last.text) : '';
          return h(
            'li',
            {},
            h(
              'button',
              { class: 'room', type: 'button', onclick: () => onOpen(r.id) },
              display.avatar(r.id),
              h('span', { class: 'room__body' }, h('div', { class: 'room__name' }, display.name(r.id)), h('div', { class: 'room__last' }, preview)),
              h(
                'span',
                { class: 'room__meta' },
                h('span', {}, last?.time ?? ''),
                r.id === waitingRoom ? h('span', { class: 'room__waiting' }, '답장 대기') : null,
                r.unread ? h('span', { class: 'badge', 'aria-label': `안 읽은 메시지 ${r.unread}개` }, String(r.unread)) : null,
              ),
            ),
          );
        }),
      );
    },
  };
}
