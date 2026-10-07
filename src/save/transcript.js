// 불러오기 때 대화방 화면을 다시 만든다. 저장 데이터에는 문장이 없고(장면 id + 노드 id + 선택 번호만),
// 문장은 시나리오 데이터에서 다시 찾는다. DOM 없음 → node --test로 검증.
//
// 시나리오가 바뀌어 기록의 노드·선택지를 찾을 수 없으면 그 항목은 건너뛰고 missing에 센다 (DEC-021, 호환 미보장).

export async function rebuildRooms(state, loadScene, config) {
  const scenes = new Map();
  const sceneOf = async (id) => {
    if (!scenes.has(id)) scenes.set(id, loadScene(id).then((s) => new Map(s.nodes.map((n) => [n.id, n])), () => null));
    return scenes.get(id);
  };

  const rooms = [];
  let missing = 0;
  for (const [id, room] of Object.entries(state.rooms ?? {})) {
    const items = [];
    for (const entry of room.log) {
      const node = (await sceneOf(entry.sceneId))?.get(entry.nodeId);
      const text = textOf(node, entry);
      if (text == null) {
        missing++;
        continue;
      }
      items.push({ entry, speaker: entry.speaker, text, time: entry.time ?? null, day: entry.day ?? null, kind: kindOf(entry.speaker, config) });
    }
    rooms.push({ id, items, seq: Math.max(0, ...room.log.map((e) => e.seq ?? 0)) });
  }
  return { rooms, missing };
}

function textOf(node, entry) {
  if (!node) return null;
  if (entry.option !== undefined) {
    const opt = node.options?.[entry.option];
    if (!opt) return null;
    const text = opt.send === undefined ? opt.text : opt.send;
    return text === false ? null : text;
  }
  return typeof node.text === 'string' ? node.text : null;
}

export function kindOf(speaker, config) {
  if (speaker === config.playerId) return 'me';
  if (speaker === config.systemId) return 'system';
  return 'other';
}
