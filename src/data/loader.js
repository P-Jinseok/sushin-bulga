// JSON 로드와 캐시. 장면 경로는 sceneId에서 계산한다 (scenes/<route>/<sceneId>.json).

import { scenePath } from '../core/ids.js';

const cache = new Map();

export async function fetchJson(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`${url} 를 불러오지 못함 (HTTP ${res.status})`);
        return res.json();
      }),
    );
  }
  try {
    return structuredClone(await cache.get(url));
  } catch (e) {
    cache.delete(url); // 실패는 캐시하지 않음
    throw e;
  }
}

// base: 장면 폴더의 상위 경로 (예: "scenario/" 또는 "scenario/_test/engine/")
export function createSceneLoader(base) {
  const root = base.endsWith('/') ? base : base + '/';
  return (sceneId) => fetchJson(root + scenePath(sceneId));
}
