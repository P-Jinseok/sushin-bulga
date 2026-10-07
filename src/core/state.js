// 게임 상태: 수치·플래그·위치·연락처·대화방 기록(읽음 포함)·시계.
// 대화 기록은 문장이 아니라 장면 id + 노드 id (+ 선택 번호)만 저장한다.
// 표시 시각(time, day)과 전체 순서(seq)는 기록 시점에 함께 남긴다 (불러오기 때 화면 재구성용).

export const STATE_VERSION = 1;

export function createState(config) {
  const affection = {};
  for (const id of config.affectionTargets) affection[id] = 0;
  return {
    version: STATE_VERSION,
    position: null,
    stats: { affection, clue: 0, alert: 0 },
    flags: {},
    contacts: {},
    rooms: {},
    clock: { day: null, time: null },
    seq: 0, // 대화 기록 전체 순번 (방 목록 최근 순 정렬에 사용)
    battery: 100, // 게임 속 휴대폰 배터리 (fx battery)
  };
}

// stat 경로: "affection.harin" | "clue" | "alert". 잘못된 경로면 null.
export function parseStatPath(path, config) {
  if (path === 'clue' || path === 'alert') return { key: path };
  const m = /^affection\.([a-z]+)$/.exec(path ?? '');
  if (m && config.affectionTargets.includes(m[1])) return { key: 'affection', target: m[1] };
  return null;
}

export function getStat(state, path, config) {
  const p = parseStatPath(path, config);
  if (!p) throw new Error(`잘못된 stat 경로: ${path}`);
  const v = p.target ? state.stats.affection[p.target] : state.stats[p.key];
  return v ?? 0;
}

export function setStat(state, path, value, config) {
  const p = parseStatPath(path, config);
  if (!p) throw new Error(`잘못된 stat 경로: ${path}`);
  const { min, max } = config.ranges[p.key];
  const clamped = Math.min(max, Math.max(min, value));
  if (p.target) state.stats.affection[p.target] = clamped;
  else state.stats[p.key] = clamped;
  return clamped;
}

export function getFlag(state, name) {
  return state.flags[name] === true;
}

function roomOf(state, room) {
  if (!state.rooms[room]) state.rooms[room] = { log: [] };
  return state.rooms[room];
}

export function addLogEntry(state, room, entry) {
  state.seq = (state.seq ?? 0) + 1;
  Object.assign(entry, { time: state.clock.time, day: state.clock.day, seq: state.seq });
  roomOf(state, room).log.push(entry);
  return entry;
}

// 그 방의 도하 메시지를 모두 읽음 처리. 바뀐 개수를 반환.
export function markRoomRead(state, room) {
  let changed = 0;
  for (const e of roomOf(state, room).log) {
    if (e.read === false) {
      e.read = true;
      changed++;
    }
  }
  return changed;
}

export function findLogEntry(state, room, sceneId, nodeId) {
  return roomOf(state, room).log.find((e) => e.sceneId === sceneId && e.nodeId === nodeId) ?? null;
}

export function lastPlayerEntry(state, room, playerId) {
  const log = roomOf(state, room).log;
  for (let i = log.length - 1; i >= 0; i--) if (log[i].speaker === playerId) return log[i];
  return null;
}

export function cloneState(state) {
  return structuredClone(state);
}
