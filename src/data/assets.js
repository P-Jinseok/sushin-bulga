// 소재(이미지) ID → 파일 경로 표 (지시서 #20). 표는 assets/manifest.json: { "version": 1, "images": { "<ID>": "<assets/ 기준 경로>" } }
// characters.json의 profiles.*.image에는 파일명이 아니라 ID를 쓴다 (DEC-010). 표가 없거나 틀려도 게임은 그대로 진행한다
// (이미지 대신 컬러·이니셜 표시).

export const ASSET_BASE = 'assets/';

let images = {};

// 표 데이터를 받아 등록한다. 형식이 틀리면 빈 표 (모든 이미지가 플레이스홀더로 표시됨)
export function setAssetManifest(data) {
  const table = data && typeof data === 'object' && data.images && typeof data.images === 'object' && !Array.isArray(data.images) ? data.images : {};
  images = Object.fromEntries(Object.entries(table).filter(([id, p]) => id && typeof p === 'string' && p.trim()));
}

// fetchJson으로 표를 읽는다. 실패하면 빈 표
export async function loadAssetManifest(fetchJson, url = ASSET_BASE + 'manifest.json') {
  try {
    setAssetManifest(await fetchJson(url));
  } catch {
    setAssetManifest(null);
  }
}

// 이미지 ID → URL. ID가 없거나(null) 표에 없으면 null
export function imageUrl(id) {
  if (typeof id !== 'string' || !id) return null;
  const p = images[id];
  return p ? ASSET_BASE + p : null;
}

// assets/credits.json → 표시할 항목 목록. { "credits": [ { id, title, author, source, license, checked, note } ] }
// 형식이 틀리거나 비어 있으면 [] (크레딧 메뉴를 숨긴다)
export function parseCredits(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.credits) ? data.credits : [];
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return list
    .filter((c) => c && typeof c === 'object' && (str(c.id) || str(c.title)))
    .map((c) => ({ id: str(c.id), title: str(c.title), author: str(c.author), source: str(c.source), license: str(c.license), checked: str(c.checked), note: str(c.note) }));
}
