// runner ↔ 화면 연결. runner가 호출하는 presenter 인터페이스(engine-design.md 3-1)를 구현한다.
//
// 방 전환 규칙 (M2-4):
// - 장면이 시작되면 그 장면의 기본 방(scene.room)을 연다.
// - 지금 보고 있지 않은 방에 메시지가 오면 그 방의 안 읽은 수만 올린다 (알림 배너는 M2-6).
// - 선택지가 다른 방에 있으면 선택지 영역에 "○○ 대화방에서 답장 대기" 버튼을 보여 준다.

import { h } from './dom.js';
import { createAvatar } from './avatar.js';
import { createChatView } from './chat-view.js';
import { createRoomList } from './room-list.js';
import { createChoiceView } from './choice-view.js';

const STATE_FX = new Set(['delete_msg', 'send_fail', 'time_jump']);

export function createPresenter({ app, config, getState, clock, onRestart, onChange }) {
  const display = {
    name(id) {
      const c = config.characters.get(id);
      return getState().contacts[id]?.name ?? c?.displayName ?? c?.name ?? id;
    },
    avatar(id, size) {
      return createAvatar(config.characters.get(id), { variant: getState().contacts[id]?.profile ?? 'default', size });
    },
  };

  const rooms = new Map();
  let seq = 0;
  let current = null; // 보고 있는 방 id, null이면 목록 화면
  let pending = null; // 대기 중인 선택지 { room, view, resolve }
  let ended = false;

  const roomOf = (id) => {
    if (!rooms.has(id)) rooms.set(id, { id, items: [], unread: 0, seq: 0, typing: null });
    return rooms.get(id);
  };

  const chat = createChatView({ display, onBack: () => openList(), onSkip: () => clock.skip() });
  const list = createRoomList({ display, onOpen: (id) => openRoom(id) });
  // 선택지 영역이 생기거나 사라지면 메시지 목록 높이가 바뀐다 → 맨 아래를 보고 있었다면 유지
  const choices = Object.fromEntries(
    Object.entries(createChoiceView(chat.choiceArea)).map(([name, fn]) => [name, (...args) => chat.keepBottom(() => fn(...args))]),
  );

  function refreshStatus() {
    const t = getState().clock.time;
    chat.status.update(t);
    list.status.update(t);
  }

  function renderList() {
    list.render([...rooms.values()], pending?.room ?? null);
  }

  function renderChoiceArea() {
    if (ended) return;
    if (!pending) return choices.clear();
    if (pending.room === current) {
      choices.show(pending.view, (index) => {
        const p = pending;
        pending = null;
        choices.clear();
        renderList();
        p.resolve(index);
      });
    } else {
      const target = pending.room;
      choices.showWaiting(`${display.name(target)} 대화방에서 답장을 기다리고 있어요 ›`, () => openRoom(target));
    }
  }

  function openRoom(id) {
    current = id;
    const room = roomOf(id);
    room.unread = 0;
    app.replaceChildren(chat.el); // 화면에 붙인 뒤 그려야 맨 아래로 스크롤된다
    chat.show(room);
    renderChoiceArea();
    refreshStatus();
    onChange?.();
  }

  function openList() {
    current = null;
    renderList();
    app.replaceChildren(list.el);
    refreshStatus();
    onChange?.();
  }

  function itemKind(speaker) {
    if (speaker === config.playerId) return 'me';
    if (speaker === config.systemId) return 'system';
    return 'other';
  }

  return {
    get currentRoom() {
      return current;
    },

    // ── runner 인터페이스 ──
    sceneStart({ scene }) {
      openRoom(scene.room);
    },

    typing({ room, speaker, on }) {
      roomOf(room).typing = on ? speaker : null;
      if (room === current) chat.setTyping(on ? speaker : null);
    },

    message({ room, speaker, text, entry }) {
      const r = roomOf(room);
      const { time, day } = getState().clock;
      const item = { entry, speaker, text, time, day, kind: itemKind(speaker) };
      r.items.push(item);
      r.seq = ++seq;
      if (room === current) chat.append(item);
      else if (item.kind === 'other') r.unread++;
      if (current === null) renderList();
      refreshStatus();
      onChange?.();
    },

    readUpdate({ room }) {
      if (room === current) chat.refreshMarkers(roomOf(room));
      onChange?.();
    },

    choose(view, signal) {
      return new Promise((resolve) => {
        pending = { room: view.room, view, resolve };
        signal.addEventListener('abort', () => {
          // 시간 초과(또는 정리)로 취소됨
          if (pending?.view === view) {
            pending = null;
            choices.clear();
            if (current === null) renderList();
          }
        });
        renderChoiceArea();
        if (current === null) renderList();
      });
    },

    fx({ node }) {
      // 연출 렌더링은 M2-9. 여기서는 core가 바꾼 상태(삭제·전송 실패·시각)만 화면에 반영한다.
      if (!STATE_FX.has(node.kind)) return;
      queueMicrotask(() => {
        const r = current !== null ? rooms.get(current) : null;
        if (r) chat.refreshMarkers(r);
        else renderList();
        refreshStatus();
        onChange?.();
      });
    },

    contact() {
      if (current) chat.show(roomOf(current));
      else renderList();
      onChange?.();
    },

    ending({ endingId, ending }) {
      ended = true;
      pending = null;
      if (current === null) openRoom([...rooms.values()].sort((a, b) => b.seq - a.seq)[0]?.id ?? 'j');
      chat.appendCard(
        h(
          'div',
          { class: 'ending-card', role: 'status' },
          h('div', { class: 'ending-card__label' }, `엔딩 ${endingId}`),
          h('div', { class: 'ending-card__title' }, ending?.title ?? ''),
        ),
      );
      choices.showButton('처음부터 다시', onRestart);
      onChange?.();
    },

    // 진행을 멈추고 안내한다. kind: 'stop'(아직 없는 장면 등, 정상 종료에 가까움) | 'error'
    showNotice(message, kind = 'error') {
      ended = true;
      pending = null;
      if (current === null) app.replaceChildren(chat.el);
      chat.appendCard(h('div', { class: `ending-card ending-card--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message));
      choices.showButton('처음부터 다시', onRestart);
      onChange?.();
    },
  };
}
