// 저장소. M2-5에서는 자동 저장 기록만 한다. 불러오기·수동 슬롯·meta는 M2-7.

export const AUTO_KEY = 'mvn.auto';
export const SAVE_VERSION = 1;

// 자동 저장. 저장소를 쓸 수 없으면(사생활 보호 모드 등) false를 반환하고 게임은 계속 진행한다.
export function writeAutosave(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(AUTO_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: new Date().toISOString(), state }));
    return true;
  } catch {
    return false;
  }
}
