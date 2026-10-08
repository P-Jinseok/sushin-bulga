// runner ↔ 화면 연결. runner가 호출하는 presenter 인터페이스(engine-design.md 3-1)를 구현한다.
//
// 방 전환·알림 규칙:
// - 장면이 시작되면 그 장면의 기본 방(scene.room)을 연다 (DEC-037).
//   예외(DEC-045): 장면 시작부터 첫 msg 전에 fx notify가 먼저 오면 방을 바로 열지 않는다.
//   (잠금화면 알림 연출) 배너를 탭하거나 그 방에 첫 메시지가 도착하면 연다.
// - 지금 보고 있지 않은 방에 상대 메시지가 오면 그 방의 안 읽은 수를 올리고 상단 배너로 알린다 (M2-6).
// - fx notify는 보고 있는 방과 관계없이 배너로 알린다 (메시지는 오지 않음).
// - 선택지가 다른 방에 있으면 선택지 영역에 "○○ 대화방에서 답장 대기" 버튼을 보여 준다.
//   배너는 잠깐 뜨는 새 메시지 알림, 답장 대기 버튼은 계속 남는 안내로 역할을 나눈다.
// - 대화 기록이 없는 인물은 방 목록에 없다. 첫 메시지가 도착하면 방이 생긴다 (DEC-038).
//
// 효과음 (지시서 #20): 실시간 사건에서만 울린다. 불러오기(restore)로 다시 그리는 기록에서는 울리지 않는다.
//   상대 말풍선 msg_in, 도하 전송 msg_out, 다른 방 메시지 배너·fx notify는 notify(새벽 장면이면 볼륨 0.5),
//   fx 종류별 같은 이름 큐, 엔딩 ending_<유형>, 제한시간 마지막 5초 timer_tick. 버튼 탭(ui_tap)은 main에서.

import { h } from './dom.js';
import { createAvatar } from './avatar.js';
import { createChatView } from './chat-view.js';
import { createRoomList } from './room-list.js';
import { createChoiceView } from './choice-view.js';
import { createBanner } from './banner.js';
import { createEndingScreen } from './screens.js';
import { createFx } from './fx.js';
import { FX_CUES, DAWN_GAIN, isDawn } from '../audio/audio.js';

const TITLE_DROP_HOLD_MS = 1500;
const STATE_FX = new Set(['delete_msg', 'send_fail', 'time_jump', 'battery']);
const BRANCH = new Set(['choice', 'cond', 'switch', 'ending', 'end_scene']);

// 장면 시작 노드부터 첫 msg 전에 notify가 있는지 (time_jump 등 다른 노드는 건너뛰며 판단, DEC-045)
export function notifyBeforeFirstMsg(scene, startId) {
  const index = new Map(scene.nodes.map((n, i) => [n.id, i]));
  let i = index.get(startId) ?? 0;
  for (let steps = 0; i !== undefined && i < scene.nodes.length && steps < 100; steps++) {
    const n = scene.nodes[i];
    if (n.type === 'msg' || BRANCH.has(n.type)) return false;
    if (n.type === 'fx' && n.kind === 'notify') return true;
    i = n.next ? index.get(n.next) : i + 1;
  }
  return false;
}

// onTitle: 타이틀로 돌아가기, getGallery: () => { seen, total } (엔딩 화면 표시용)
export function createPresenter({ app, config, getState, clock, onTitle, onChange, onMenu, getGallery, sound = { play() {} } }) {
  const notifySound = () => sound.play('notify', { gain: isDawn(getState().clock?.time) ? DAWN_GAIN : 1 });
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
  let current = null; // 보고 있는 방 id, null이면 목록 화면
  let pending = null; // 대기 중인 선택지 { room, view, resolve }
  let ended = false;
  let deferredRoom = null; // DEC-045: 첫 메시지(또는 배너 탭) 때 열 방
  let deferredOpenTimer = 0; // DEC-060: 배너 최소 3초가 지난 뒤 열기

  const roomOf = (id) => {
    if (!rooms.has(id)) rooms.set(id, { id, items: [], unread: 0, seq: 0, typing: null });
    return rooms.get(id);
  };

  // 화면 탭 = 대기 건너뛰기. 단, 알림 배너가 최소 표시 시간(3초) 안이면 건너뛰지 않는다 (DEC-060)
  const chat = createChatView({ display, onBack: () => openList(), onSkip: () => banner.holding || clock.skip(), onMenu });
  const list = createRoomList({ display, onOpen: (id) => openRoom(id), onMenu });
  // 선택지 영역이 생기거나 사라지면 메시지 목록 높이가 바뀐다 → 맨 아래를 보고 있었다면 유지
  const choices = Object.fromEntries(
    Object.entries(createChoiceView(chat.choiceArea)).map(([name, fn]) => [name, (...args) => chat.keepBottom(() => fn(...args))]),
  );
  const banner = createBanner({ display, onOpen: (id) => openRoom(id) });

  // 화면(목록·대화방)은 host 안에서 바꾸고, 배너는 그 위에 겹쳐 둔다
  const host = h('div', { class: 'screen-host' });
  app.replaceChildren(host, banner.el);
  const show = (screen) => host.replaceChildren(screen);

  function refreshStatus() {
    const { clock: c, battery = 100 } = getState();
    chat.status.update(c.time, battery);
    list.status.update(c.time, battery);
  }

  // 연출 fx (M2-9). 대상 요소는 지금 보고 있는 화면에서 찾는다
  const fx = createFx({
    clock,
    hooks: {
      frame: app,
      nameElFor: (room) => (current === room ? chat.nameEl : current === null ? list.el.querySelector(`.room__name[data-room="${room}"]`) : null),
      setTyping: (room, speaker) => {
        roomOf(room).typing = speaker;
        if (room === current) chat.setTyping(speaker);
      },
      showDay: (room, day) => {
        if (room === current) chat.showDay(day);
      },
      glitchBubble: (nodeId, during) => {
        const el = current !== null ? chat.bubbleOf(roomOf(current), nodeId) : null;
        if (!el) return during();
        el.classList.add('fx-glitch-bubble');
        return during().then(() => el.classList.remove('fx-glitch-bubble'));
      },
      statusChanged: () => refreshStatus(),
    },
  });

  function renderList() {
    list.render([...rooms.values()], pending?.room ?? null);
  }

  function renderChoiceArea() {
    if (ended) return;
    if (!pending) return choices.clear();
    if (pending.room === current) {
      choices.show(
        pending.view,
        (index) => {
          const p = pending;
          pending = null;
          choices.clear();
          renderList();
          p.resolve(index);
        },
        { onTick: () => sound.play('timer_tick') },
      );
    } else {
      const target = pending.room;
      choices.showWaiting(`${display.name(target)} 대화방에서 답장을 기다리고 있어요 ›`, () => openRoom(target));
    }
  }

  function openRoom(id) {
    if (id === deferredRoom) deferredRoom = null;
    current = id;
    const room = roomOf(id);
    room.unread = 0;
    if (banner.room === id) banner.hide();
    show(chat.el); // 화면에 붙인 뒤 그려야 맨 아래로 스크롤된다
    chat.show(room);
    renderChoiceArea();
    refreshStatus();
    onChange?.();
  }

  function openList() {
    current = null;
    renderList();
    show(list.el);
    refreshStatus();
    onChange?.();
  }

  function kindOf(speaker) {
    if (speaker === config.playerId) return 'me';
    if (speaker === config.systemId) return 'system';
    return 'other';
  }

  return {
    get currentRoom() {
      return current;
    },
    get ended() {
      return ended;
    },

    // 불러오기: transcript.rebuildRooms() 결과로 대화방을 채운다. 이후 runner가 sceneStart로 방을 연다.
    restore({ rooms: rebuilt }) {
      rooms.clear();
      for (const r of rebuilt) rooms.set(r.id, { id: r.id, items: r.items, unread: 0, seq: r.seq, typing: null });
    },

    // ── runner 인터페이스 ──
    sceneStart({ scene, state, resumed }) {
      if (!resumed && notifyBeforeFirstMsg(scene, state.position?.nodeId)) {
        // 알림이 먼저 온다: 지금 보던 화면을 그대로 두고(처음이면 목록) 그 방은 나중에 연다
        deferredRoom = scene.room;
        if (!host.firstChild) openList();
        return;
      }
      openRoom(scene.room);
    },

    typing({ room, speaker, on }) {
      roomOf(room).typing = on ? speaker : null;
      if (room === current) chat.setTyping(on ? speaker : null);
    },

    message({ room, speaker, text, entry }) {
      const r = roomOf(room);
      const item = { entry, speaker, text, time: entry.time ?? null, day: entry.day ?? null, kind: kindOf(speaker) };
      r.items.push(item);
      r.seq = entry.seq ?? r.seq + 1;
      if (item.kind === 'system') fx.titleDrop(text); // 엔딩 직전 암전 중이면 문구를 암전 위에 (대화 기록에도 남음)
      const toBanner = room !== deferredRoom && room !== current && item.kind === 'other';
      if (item.kind === 'me') sound.play('msg_out');
      else if (item.kind === 'other') toBanner ? notifySound() : sound.play('msg_in');
      if (room === deferredRoom) {
        // 미뤄 둔 방은 첫 메시지가 오면 연다 (방금 넣은 메시지까지 그려짐).
        // 그 방 알림 배너가 아직 최소 3초가 안 됐으면 3초가 될 때 연다 (DEC-060)
        const wait = banner.room === room ? banner.minRemaining() : 0;
        if (wait <= 0) openRoom(room);
        else if (!deferredOpenTimer)
          deferredOpenTimer = setTimeout(() => {
            deferredOpenTimer = 0;
            if (deferredRoom === room) openRoom(room);
          }, wait);
      } else if (room === current) chat.append(item);
      else if (item.kind === 'other') {
        r.unread++;
        banner.show({ room, text });
      }
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

    fx({ node, room, nextType, leadsToEnding }) {
      if (node.kind === 'notify') {
        banner.show({ room, text: node.text });
        notifySound();
        return;
      }
      if (FX_CUES.has(node.kind)) sound.play(node.kind);
      const shown = fx.run(node, room, { nextType, leadsToEnding });
      // core가 바꾼 상태(삭제·전송 실패·시각·배터리)를 화면에 반영 (상태 변경은 이 호출 직후 동기로 일어남)
      if (!STATE_FX.has(node.kind)) return shown;
      queueMicrotask(() => {
        const r = current !== null ? rooms.get(current) : null;
        if (r) chat.refreshMarkers(r);
        else renderList();
        refreshStatus();
        onChange?.();
      });
      return shown;
    },

    contact() {
      if (current) chat.show(roomOf(current));
      else renderList();
      onChange?.();
    },

    ending({ endingId, ending, isNew }) {
      ended = true;
      pending = null;
      banner.hide();
      choices.clear();
      const { seen, total } = getGallery();
      const screen = createEndingScreen({ endingId, ending, isNew, seen, total, onTitle });
      const show = () => {
        if (ending?.type) sound.play(`ending_${ending.type}`);
        app.append(screen);
        screen.querySelector('button')?.focus();
        onChange?.();
      };
      // 암전 위 문구(타이틀 드롭)가 있으면 읽을 시간을 두고 엔딩 카드를 띄운다 (DEC-057)
      if (fx.hasTitleDrop) setTimeout(show, TITLE_DROP_HOLD_MS);
      else show();
    },

    // 진행을 멈추고 안내한다. kind: 'stop'(아직 없는 장면 등, 정상 종료에 가까움) | 'error' | 'info'(진행은 계속)
    showNotice(message, kind = 'error') {
      if (kind !== 'info') {
        ended = true;
        pending = null;
      }
      if (current === null) show(chat.el);
      chat.appendCard(h('div', { class: `ending-card ending-card--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message));
      if (kind !== 'info') choices.showButton('타이틀로', onTitle);
      onChange?.();
    },
  };
}
