// 노드 러너: 장면 데이터를 노드 단위로 실행한다. DOM을 모르며 화면은 presenter에 위임한다.
// 인터페이스와 흐름은 docs/design/engine-design.md 3~4절.

import { evaluate } from './conditions.js';
import { applyEffects } from './effects.js';
import { addLogEntry, markRoomRead, lastPlayerEntry, cloneState } from './state.js';
import { recordEnding } from './meta.js';

const BRANCH_TYPES = new Set(['choice', 'cond', 'switch', 'ending', 'end_scene']);
const INSTANT_LIMIT = 1000; // 대기 없이 연속 실행되는 노드 상한 (데이터의 무한 루프 방지)

export function createRunner({ loadScene, presenter, clock, config, state, meta = null, hooks = {} }) {
  let scene = null;
  let byId = new Map();
  let instantSteps = 0;
  // 아직 끝나지 않은 상태 변경 fx (DEC-029). 저장 직전에 즉시 완료 처리한다.
  const pendingFx = new Set();

  const ctx = () => ({ state, config, meta });
  const call = (name, arg, ...rest) => presenter[name]?.(arg, ...rest);
  const roomOf = (node) => node.room ?? scene.room;

  // 저장용 사본. 대기 중인 상태 변경 fx를 먼저 완료한다. 자동 저장과 (M2-7) 수동 저장이 함께 쓴다.
  function snapshot() {
    for (const p of [...pendingFx]) p.apply();
    return cloneState(state);
  }

  // reason: 'scene'(장면 진입) | 'choice'(선택 직후) | 'timeout'(제한시간 초과 직후)
  function autosave(reason) {
    hooks.autosave?.(snapshot(), reason);
  }

  // 한 번만 적용되는 상태 변경을 대기 목록에 올린다. 시간이 되면 또는 저장 직전에 적용된다.
  function deferStateChange(fn) {
    const p = {
      apply() {
        if (!pendingFx.delete(p)) return;
        fn();
      },
    };
    pendingFx.add(p);
    return p;
  }

  async function enterScene(sceneId, nodeId = null) {
    try {
      scene = await loadScene(sceneId);
    } catch (cause) {
      // 아직 없는 장면(예: 집필 전 루트) 등. 상태는 그대로 두고 멈춘다. 화면은 code로 구분해 안내한다.
      const err = new Error(`장면 "${sceneId}"을 불러오지 못함: ${cause.message}`, { cause });
      err.code = 'SCENE_LOAD';
      err.sceneId = sceneId;
      throw err;
    }
    byId = new Map(scene.nodes.map((n, i) => [n.id, i]));
    const resuming = nodeId != null && byId.has(nodeId);
    if (!resuming) {
      // 새로 진입하거나, 세이브의 노드가 사라졌으면 장면 처음부터 (DEC-021)
      if (scene.time) state.clock.time = scene.time;
      if (scene.day) state.clock.day = scene.day;
    }
    const start = resuming ? nodeId : scene.start ?? scene.nodes[0].id;
    state.position = { sceneId: scene.sceneId, nodeId: start };
    await call('sceneStart', { scene, state, resumed: resuming });
    if (!resuming) autosave('scene');
    return start;
  }

  function nodeById(id) {
    const i = byId.get(id);
    if (i === undefined) throw new Error(`${scene.sceneId}: 노드 "${id}" 없음`);
    return scene.nodes[i];
  }

  function implicitNext(node) {
    if (node.next) return node.next;
    if (BRANCH_TYPES.has(node.type)) throw new Error(`${scene.sceneId} / ${node.id}: 분기 노드에 이동 대상 없음`);
    const following = scene.nodes[byId.get(node.id) + 1];
    if (!following) throw new Error(`${scene.sceneId} / ${node.id}: 다음 노드 없음`);
    return following.id;
  }

  async function runMsg(node) {
    const room = roomOf(node);
    if (node.time) state.clock.time = node.time;
    const entry = { sceneId: scene.sceneId, nodeId: node.id, speaker: node.speaker };

    if (node.speaker === config.playerId) {
      await clock.wait(node.delay ?? 0); // 보내기 전 망설임, 입력 중 표시 없음
      entry.read = false;
    } else if (node.speaker === config.systemId) {
      await clock.wait(node.delay ?? 0);
    } else {
      await call('typing', { room, speaker: node.speaker, on: true });
      await clock.wait(node.delay ?? 0);
      await call('typing', { room, speaker: node.speaker, on: false });
      if (markRoomRead(state, room)) await call('readUpdate', { room }); // 상대가 답장 → 이전 도하 메시지 읽음
    }
    addLogEntry(state, room, entry);
    await call('message', { room, speaker: node.speaker, text: node.text, entry });
    return implicitNext(node);
  }

  async function runChoice(node) {
    const room = roomOf(node);
    const view = node.options.map((opt, index) => {
      const enabled = !opt.if || evaluate(opt.if, ctx());
      const hidden = !enabled && (opt.lockedMode ?? 'hide') === 'hide';
      return { index, text: opt.text, tone: opt.tone, enabled, hint: enabled ? undefined : opt.lockedHint, hidden };
    });

    if (!view.some((v) => v.enabled)) {
      if (node.fallback) return node.fallback;
      throw new Error(`${scene.sceneId} / ${node.id}: 선택 가능한 선택지가 없고 fallback도 없음`);
    }

    const options = view.filter((v) => !v.hidden).map(({ hidden, ...v }) => v);
    const timer = node.timer ?? 0;
    const ac = new AbortController();
    const meter = {}; // 제한시간 남은 시간 (clock이 채움, 일시정지 반영)
    const racers = [];
    if (timer > 0) {
      const never = new Promise(() => {});
      racers.push(
        clock.wait(timer * 1000, { skippable: false, signal: ac.signal, meter }).then((done) => (done ? { timeout: true } : never)),
      );
    }
    racers.push(Promise.resolve(presenter.choose({ node, room, options, timer, meter }, ac.signal)).then((index) => ({ index })));
    const result = await Promise.race(racers);
    ac.abort(); // 남은 쪽(제한시간 또는 선택 UI) 정리

    let next;
    if (result.timeout) {
      applyEffects(state, node.timeoutEffects, config);
      next = node.timeoutNext;
    } else {
      const opt = node.options[result.index];
      if (!opt || !view[result.index].enabled) throw new Error(`${scene.sceneId} / ${node.id}: 선택할 수 없는 선택지 ${result.index}`);
      const text = opt.send === undefined ? opt.text : opt.send;
      if (text !== false) {
        const entry = { sceneId: scene.sceneId, nodeId: node.id, speaker: config.playerId, option: result.index, read: false };
        addLogEntry(state, room, entry);
        await call('message', { room, speaker: config.playerId, text, entry });
      }
      applyEffects(state, opt.effects, config);
      next = opt.next;
    }
    state.position = { sceneId: scene.sceneId, nodeId: next };
    autosave(result.timeout ? 'timeout' : 'choice'); // 선택·시간 초과 직후 (DEC-017, DEC-025)
    return next;
  }

  function findEntry(sceneId, nodeId) {
    for (const r of Object.values(state.rooms)) {
      const e = r.log.find((x) => x.sceneId === sceneId && x.nodeId === nodeId);
      if (e) return e;
    }
    return null;
  }

  // node 다음부터 system 메시지만 이어지다 ending에 닿으면 true
  function leadsToEnding(node) {
    let cur = node;
    for (let steps = 0; steps < 50; steps++) {
      let next;
      try {
        next = nodeById(implicitNext(cur));
      } catch {
        return false;
      }
      if (next.type === 'ending') return true;
      if (next.type !== 'msg' || next.speaker !== config.systemId) return false;
      cur = next;
    }
    return false;
  }

  async function runFx(node) {
    const room = roomOf(node);
    // 다음 노드 종류와, 시스템 문구만 거쳐 엔딩에 닿는지 알려 준다 (엔딩 직전 암전 유지, DEC-053·DEC-057)
    let nextType = null;
    try {
      nextType = nodeById(implicitNext(node)).type;
    } catch {}
    const shown = Promise.resolve(call('fx', { node, room, nextType, leadsToEnding: leadsToEnding(node) }));
    const work = (async () => {
      switch (node.kind) {
        case 'read': {
          const change = deferStateChange(() => {
            if (markRoomRead(state, room)) call('readUpdate', { room });
          });
          await clock.wait(node.delay ?? 0);
          change.apply();
          break;
        }
        case 'time_jump':
          if (node.time) state.clock.time = node.time;
          if (node.day) state.clock.day = node.day;
          break;
        case 'battery': // 상단 배터리 표시 (0~100). 세이브에 포함
          state.battery = Math.min(100, Math.max(0, Number(node.level) || 0));
          break;
        case 'delete_msg': {
          const e = findEntry(scene.sceneId, node.target);
          if (e) e.deleted = true;
          break;
        }
        case 'send_fail': {
          const e = node.target ? findEntry(scene.sceneId, node.target) : lastPlayerEntry(state, room, config.playerId);
          if (e) e.failed = true;
          break;
        }
      }
      await clock.wait(node.duration ?? 0);
    })();
    if (node.async) {
      Promise.all([shown, work]).catch((e) => hooks.onError?.(e));
    } else {
      await Promise.all([shown, work]);
    }
    return implicitNext(node);
  }

  async function runContact(node) {
    const prev = state.contacts[node.target] ?? {};
    // contact가 실행되면 displayName 대신 노드의 name, 없으면 캐릭터의 name을 쓴다 (지시서 #03 r2)
    const next = { ...prev, name: node.name ?? config.characters.get(node.target)?.name ?? prev.name };
    if (node.profile !== undefined) next.profile = node.profile;
    state.contacts[node.target] = next;
    await call('contact', { target: node.target, ...next });
    return implicitNext(node);
  }

  // 장면을 실행한다. 엔딩에 도달하면 { endingId }를 반환한다.
  // nodeId를 주면 세이브 위치에서 재개 (그 노드가 없으면 장면 처음부터).
  async function run({ sceneId, nodeId = null }) {
    let id = await enterScene(sceneId, nodeId);
    for (;;) {
      state.position = { sceneId: scene.sceneId, nodeId: id };
      const node = nodeById(id);
      hooks.onNode?.(scene.sceneId, node.id); // 도구용 (분기 탐색의 노드 도달 확인)
      const instant = ['cond', 'switch', 'effect'].includes(node.type);
      instantSteps = instant ? instantSteps + 1 : 0;
      if (instantSteps > INSTANT_LIMIT) throw new Error(`${scene.sceneId} / ${node.id}: 대기 없는 노드가 계속 반복됨 (무한 루프 의심)`);

      switch (node.type) {
        case 'msg':
          id = await runMsg(node);
          break;
        case 'choice':
          id = await runChoice(node);
          break;
        case 'cond':
          id = evaluate(node.if, ctx()) ? node.then : node.else;
          break;
        case 'switch': {
          const hit = node.cases.find((c) => evaluate(c.if, ctx()));
          id = hit ? hit.next : node.default;
          break;
        }
        case 'effect':
          applyEffects(state, node.effects, config);
          id = implicitNext(node);
          break;
        case 'fx':
          id = await runFx(node);
          break;
        case 'contact':
          id = await runContact(node);
          break;
        case 'ending': {
          const ending = config.endings.get(node.endingId) ?? null;
          const isNew = meta ? recordEnding(meta, node.endingId) : false;
          hooks.onEnding?.(node.endingId, ending, { isNew });
          await call('ending', { endingId: node.endingId, ending, isNew });
          return { endingId: node.endingId };
        }
        case 'end_scene':
          id = await enterScene(node.next);
          break;
        default:
          throw new Error(`${scene.sceneId} / ${node.id}: 알 수 없는 노드 타입 "${node.type}"`);
      }
    }
  }

  return {
    run,
    snapshot,
    get state() {
      return state;
    },
    get scene() {
      return scene;
    },
  };
}
