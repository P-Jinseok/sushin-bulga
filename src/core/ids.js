// 장면·노드 ID 규칙 (scenario-format 1절, 11절). 엔진과 lint가 공유한다.

export const ROUTES = ['prologue', 'harin', 'nayeon', 'chaerin', 'sera', 'j', 'common'];

export const NODE_PREFIX = {
  prologue: 'p',
  harin: 'h',
  nayeon: 'n',
  chaerin: 'c',
  sera: 'se',
  j: 'j',
  common: 'cm',
};

// "harin_s2" → { route: "harin", number: 2 }. 형식이 틀리면 null.
export function parseSceneId(sceneId) {
  const m = /^([a-z]+)_s(\d+)$/.exec(sceneId ?? '');
  if (!m || !ROUTES.includes(m[1])) return null;
  return { route: m[1], number: Number(m[2]) };
}

// "harin_s2" → "scenes/harin/harin_s2.json" (scenario/ 기준 상대 경로)
export function scenePath(sceneId) {
  const parsed = parseSceneId(sceneId);
  if (!parsed) throw new Error(`잘못된 장면 ID: ${sceneId}`);
  return `scenes/${parsed.route}/${sceneId}.json`;
}

// 노드 ID가 "<약어><장면번호>_<순번 또는 이름>" 규칙에 맞는지
export function isValidNodeId(nodeId, sceneId) {
  const parsed = parseSceneId(sceneId);
  if (!parsed) return false;
  const prefix = NODE_PREFIX[parsed.route] + parsed.number + '_';
  if (!nodeId.startsWith(prefix)) return false;
  const rest = nodeId.slice(prefix.length);
  return /^\d{3}$/.test(rest) || /^[a-z][a-z0-9_]*$/.test(rest);
}
