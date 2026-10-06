// 세이브와 별개로 영구 유지되는 기록: 본 엔딩 (갤러리, cleared 조건, J 해금).

import { evaluate } from './conditions.js';

export const META_VERSION = 1;

export function createMeta() {
  return { version: META_VERSION, seenEndings: [] };
}

export function recordEnding(meta, endingId) {
  if (!meta.seenEndings.includes(endingId)) meta.seenEndings.push(endingId);
}

// characters.json의 unlock 조건(조건 문법과 동일)으로 해금 여부 판정. unlock이 없으면 항상 해금.
export function isUnlocked(character, { meta, config, state }) {
  if (!character.unlock) return true;
  return evaluate(character.unlock, { meta, config, state: state ?? { flags: {}, stats: {} } });
}
