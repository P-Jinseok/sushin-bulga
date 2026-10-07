// 저장소 (M2-7): 자동 저장 1개 + 수동 슬롯 3개. localStorage 사용, DOM 없음.
// 저장 데이터는 { version, savedAt, state }. state에는 시나리오의 id만 있고 새 문자열을 만들지 않는다 (CLAUDE.md 6항).
// 개발 중에는 호환을 보장하지 않는다: 버전이 다르면 읽지 않는다 (DEC-021).

export const AUTO_KEY = 'mvn.auto';
export const SLOT_COUNT = 3;
export const slotKey = (n) => `mvn.slot.${n}`;
export const SAVE_VERSION = 1;

const defaultStorage = () => globalThis.localStorage;

// 저장. 저장소를 쓸 수 없으면(사생활 보호 모드·용량 초과 등) false를 반환하고 게임은 계속 진행한다.
export function writeSave(key, state, storage = defaultStorage()) {
  try {
    storage.setItem(key, JSON.stringify({ version: SAVE_VERSION, savedAt: new Date().toISOString(), state }));
    return true;
  } catch {
    return false;
  }
}

export const writeAutosave = (state, storage) => writeSave(AUTO_KEY, state, storage);

// 읽기. { ok: true, save } 또는 { ok: false, reason: 'none' | 'corrupt' | 'version' | 'unavailable' }
export function readSave(key, storage = defaultStorage()) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (raw == null) return { ok: false, reason: 'none' };
  let save;
  try {
    save = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!save || typeof save !== 'object' || !save.state?.position) return { ok: false, reason: 'corrupt' };
  if (save.version !== SAVE_VERSION) return { ok: false, reason: 'version' };
  return { ok: true, save };
}

// 저장 화면용 목록: 자동 저장 + 슬롯 1~3
export function listSaves(storage = defaultStorage()) {
  return [
    { key: AUTO_KEY, label: '자동 저장', auto: true, ...readSave(AUTO_KEY, storage) },
    ...Array.from({ length: SLOT_COUNT }, (_, i) => ({ key: slotKey(i + 1), label: `슬롯 ${i + 1}`, auto: false, ...readSave(slotKey(i + 1), storage) })),
  ];
}

export function storageAvailable(storage = defaultStorage()) {
  try {
    const k = 'mvn.__probe';
    storage.setItem(k, '1');
    storage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// 저장 요약 (화면 표시용). 장면 제목은 제작용이라 쓰지 않고, 게임 속 요일·시각과 마지막 대화 상대만 쓴다.
export function summarize(state) {
  let last = null;
  for (const [room, r] of Object.entries(state.rooms ?? {})) for (const e of r.log) if (!last || (e.seq ?? 0) > last.seq) last = { room, seq: e.seq ?? 0 };
  return { day: state.clock?.day ?? null, time: state.clock?.time ?? null, room: last?.room ?? null };
}

// ── meta (M2-8): 본 엔딩 ID 목록. 저장 슬롯과 별개로 영구 유지하고, "처음부터"로도 지우지 않는다.
// 읽을 수 없거나 버전이 다르면 원본을 META_BACKUP_KEY에 옮겨 두고 빈 기록으로 시작한다 (기록을 조용히 잃지 않게).

export const META_KEY = 'mvn.meta';
export const META_BACKUP_KEY = 'mvn.meta.backup';
export const META_SAVE_VERSION = 1;

// { meta, status: 'ok' | 'none' | 'corrupt' | 'version' | 'unavailable' }
export function readMeta(createEmpty, storage = defaultStorage()) {
  let raw;
  try {
    raw = storage.getItem(META_KEY);
  } catch {
    return { meta: createEmpty(), status: 'unavailable' };
  }
  if (raw == null) return { meta: createEmpty(), status: 'none' };
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {}
  const valid = data && Array.isArray(data.seenEndings) && data.seenEndings.every((x) => typeof x === 'string');
  const status = !valid ? 'corrupt' : data.version !== META_SAVE_VERSION ? 'version' : 'ok';
  if (status === 'ok') return { meta: { ...createEmpty(), seenEndings: [...data.seenEndings] }, status };
  try {
    storage.setItem(META_BACKUP_KEY, raw);
  } catch {}
  return { meta: createEmpty(), status };
}

export function writeMeta(meta, storage = defaultStorage()) {
  try {
    storage.setItem(META_KEY, JSON.stringify({ version: META_SAVE_VERSION, seenEndings: meta.seenEndings }));
    return true;
  } catch {
    return false;
  }
}

export function removeSave(key, storage = defaultStorage()) {
  try {
    storage.removeItem(key);
  } catch {}
}
