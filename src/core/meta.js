// 세이브와 별개로 영구 유지되는 기록(meta): 본 엔딩 ID 목록.
// 클리어한 루트·J 해금·갤러리는 모두 이 목록과 endings.json에서 계산한다 (엔딩 제목 등 문자열은 저장하지 않음).

import { evaluate } from './conditions.js';

export const META_VERSION = 1;

export function createMeta() {
  return { version: META_VERSION, seenEndings: [] };
}

// 본 엔딩으로 기록한다. 처음 본 엔딩이면 true.
export function recordEnding(meta, endingId) {
  if (meta.seenEndings.includes(endingId)) return false;
  meta.seenEndings.push(endingId);
  return true;
}

// characters.json의 unlock 조건(조건 문법과 동일)으로 해금 여부 판정. unlock이 없으면 항상 해금.
export function isUnlocked(character, { meta, config, state }) {
  if (!character.unlock) return true;
  return evaluate(character.unlock, { meta, config, state: state ?? { flags: {}, stats: {} } });
}

// 루트별로 본 엔딩 유형 { harin: ['bad', 'normal'], ... }
export function clearedRoutes(meta, config) {
  const out = {};
  for (const id of meta.seenEndings) {
    const e = config.endings.get(id);
    if (e) (out[e.route] ??= []).push(e.type);
  }
  return out;
}

// 갤러리 표시용. endings.json의 order 순. 못 본 엔딩은 번호만 있고 제목·유형·ID·루트를 담지 않는다
// (화면 어디에도 미리 드러나지 않게. J 엔딩도 못 봤으면 다른 엔딩과 똑같이 보인다).
export function galleryModel(meta, config) {
  const all = [...config.endings.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const items = all.map((e, i) =>
    meta.seenEndings.includes(e.id) ? { no: i + 1, seen: true, id: e.id, title: e.title, type: e.type } : { no: i + 1, seen: false },
  );
  return { total: items.length, seen: items.filter((i) => i.seen).length, items };
}
