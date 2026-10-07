// JSON 로드와 캐시. 장면 경로는 sceneId에서 계산한다 (scenes/<route>/<sceneId>.json).
// 공개 배포본에서 인코딩된 루트(ENCODED_ROUTES)의 장면은 .dat를 받아 해독한다 (지시서 #14).
// 장면은 그 장면에 들어갈 때만 불러오므로, J 장면은 J 루트에 들어가기 전에는 받지 않는다.

import { scenePath, parseSceneId } from '../core/ids.js';
import { ENCODED_ROUTES } from '../build-config.js';
import { decodeScene } from './scene-codec.js';

const cache = new Map();

function cached(url, parse) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`${url} 를 불러오지 못함 (HTTP ${res.status})`);
        return parse(res);
      }),
    );
  }
  return cache.get(url).then(
    (v) => structuredClone(v),
    (e) => {
      cache.delete(url); // 실패는 캐시하지 않음
      throw e;
    },
  );
}

export function fetchJson(url) {
  return cached(url, (res) => res.json());
}

// base: 장면 폴더의 상위 경로 (예: "scenario/" 또는 "scenario/_test/engine/")
export function createSceneLoader(base, encodedRoutes = ENCODED_ROUTES) {
  const root = base.endsWith('/') ? base : base + '/';
  return (sceneId) => {
    const route = parseSceneId(sceneId)?.route;
    if (route && encodedRoutes.includes(route)) {
      const url = root + scenePath(sceneId).replace(/\.json$/, '.dat');
      return cached(url, async (res) => decodeScene(await res.text()));
    }
    return fetchJson(root + scenePath(sceneId));
  };
}
