// 진입점: 데이터 로드 → 타이틀 화면 → core 러너와 화면(presenter) 연결 → 플레이.
//
// URL 옵션 (개발·검증용):
//   ?data=_test/engine   장면 폴더를 scenario/_test/engine/ 으로 (기본: scenario/, 프롤로그)
//   ?new=1               타이틀을 건너뛰고 바로 처음부터
//   ?speed=2             텍스트 속도 배수 (기본 1)
//   ?debug=1             수치 확인 패널
//   ?debug=1&scene=prologue_s8&state=affection.harin:5,clue_harin_1
//                        QA 전용 장면 점프 (DEC-059). 타이틀 없이 그 장면부터, 수치·플래그 지정.
//                        저장은 [qa] 영역에 따로 해 실제 이어하기·엔딩 기록을 건드리지 않는다. debug 없이는 동작하지 않음
//   ?mock=1              M2-1 화면 목업
//
// 저장(M2-7): 자동 저장은 장면 진입·선택 직후(DEC-017, DEC-025). 슬롯 3개.
// meta(M2-8): 본 엔딩 ID 목록. 슬롯과 별개로 영구 유지 → 클리어 기록·J 해금·갤러리.
// 저장 키는 data 폴더마다 따로 둔다 (테스트 장면 저장이 프롤로그 저장을 덮지 않게).

import { createConfig } from './core/config.js';
import { createState } from './core/state.js';
import { createMeta, galleryModel } from './core/meta.js';
import { createClock } from './core/clock.js';
import { createRunner } from './core/runner.js';
import { parseSceneId } from './core/ids.js';
import { fetchJson, createSceneLoader } from './data/loader.js';
import { AUTO_KEY, writeSave, readSave, listSaves, summarize, storageAvailable, readMeta, writeMeta, removeSave } from './save/storage.js';
import { rebuildRooms } from './save/transcript.js';
import { createPresenter } from './ui/presenter.js';
import { createSaveSheet } from './ui/save-sheet.js';
import { createTitleScreen, createGalleryScreen } from './ui/screens.js';
import { createDebugPanel } from './ui/debug-panel.js';
import { readSettings, applySettings } from './ui/settings.js';
import { parseStateSpec } from './core/qa-state.js';

const params = new URLSearchParams(location.search);
const dataParam = params.get('data');
// QA 장면 점프는 debug와 함께일 때만 (일반 주소의 scene 값은 무시)
const qaJump = params.has('debug') && params.get('scene') ? params.get('scene') : null;

function dataBase() {
  if (!dataParam) return 'scenario/';
  if (!/^[a-z0-9_/-]+$/i.test(dataParam) || dataParam.includes('..')) throw new Error(`잘못된 data 경로: ${dataParam}`);
  return `scenario/${dataParam.replace(/\/?$/, '/')}`;
}

// localStorage에 data 폴더별 접두어를 붙인다 (기본 데이터는 접두어 없음)
function scopedStorage() {
  const prefix = (qaJump ? '[qa]' : '') + (dataParam ? `[${dataParam}]` : '');
  const ls = () => globalThis.localStorage; // 접근 자체가 예외인 브라우저가 있어 매번 꺼낸다 (storage.js가 예외 처리)
  return {
    getItem: (k) => ls().getItem(prefix + k),
    setItem: (k, v) => ls().setItem(prefix + k, v),
    removeItem: (k) => ls().removeItem(prefix + k),
  };
}

// 새로고침을 넘어 한 번만 전달할 값 (게임 중 슬롯 불러오기). 저장소를 못 쓰면 무시.
const once = {
  take(key) {
    try {
      const v = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      return v;
    } catch {
      return null;
    }
  },
  set(key, v) {
    try {
      sessionStorage.setItem(key, v);
    } catch {}
  },
};

const META_NOTICE = {
  corrupt: '엔딩 기록을 읽을 수 없어 새로 시작합니다 (이전 기록은 따로 보관했습니다).',
  version: '엔딩 기록의 형식이 달라 새로 시작합니다 (이전 기록은 따로 보관했습니다).',
};

async function main() {
  const app = document.getElementById('app');
  applySettings(readSettings()); // 글자 크기 (M2-10)

  const charactersData = await fetchJson('scenario/characters/characters.json');
  if (params.has('mock')) {
    const { renderMock } = await import('./ui/mock.js');
    return renderMock(app, charactersData);
  }

  const endingsData = await fetchJson('scenario/endings.json');
  const config = createConfig(charactersData, endingsData);
  const loadScene = createSceneLoader(dataBase());
  const store = scopedStorage();
  const canStore = storageAvailable(store);
  const { meta, status: metaStatus } = readMeta(createMeta, store);
  const toTitle = () => location.reload();

  // 저장 요약: 게임 속 요일·시각 + 마지막 대화 상대(저장 당시 표시 이름) + 실제 저장 시각
  const nameIn = (state, id) => {
    const c = config.characters.get(id);
    return state.contacts?.[id]?.name ?? c?.displayName ?? c?.name ?? '';
  };
  const describe = (save) => {
    const s = summarize(save.state);
    const when = new Date(save.savedAt);
    const real = isNaN(when) ? '' : ` (${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')} 저장)`;
    return [s.day, s.time].filter(Boolean).join(' ') + (s.room ? ` · ${nameIn(save.state, s.room)}` : '') + real;
  };

  // 저장 화면은 타이틀(불러오기만)과 게임 중(저장·불러오기)에서 함께 쓴다
  const pauses = new Set();
  let game = null; // { runner, presenter, clock }
  const setPaused = (reason, on) => {
    on ? pauses.add(reason) : pauses.delete(reason);
    if (game) pauses.size ? game.clock.pause() : game.clock.resume();
  };
  document.addEventListener('visibilitychange', () => setPaused('hidden', document.hidden));
  const loadAndRestart = (key) => {
    once.set('mvn.loadKey', key);
    location.reload();
  };
  const sheet = createSaveSheet({
    getEntries: () => listSaves(store),
    describe,
    canSave: () => canStore && !!game && !game.presenter.ended,
    onSave: (key) => writeSave(key, game.runner.snapshot(), store),
    onLoad: (key) => (game ? loadAndRestart(key) : startFromSave(key)),
    onOpen: () => setPaused('menu', true),
    onClose: () => setPaused('menu', false),
  });

  function startFromSave(key) {
    const r = readSave(key, store);
    if (r.ok) startGame(r.save);
  }

  // ── 타이틀 화면
  function showTitle() {
    const auto = readSave(AUTO_KEY, store);
    const notices = [];
    if (!canStore) notices.push('이 브라우저에서는 저장할 수 없습니다 (사생활 보호 모드 등). 새로고침하면 처음부터 시작합니다.');
    if (META_NOTICE[metaStatus]) notices.push(META_NOTICE[metaStatus]);
    const title = createTitleScreen({
      autoText: auto.ok ? describe(auto.save) : null,
      notices,
      onStart: () => startGame(null),
      onContinue: () => startGame(auto.save),
      onLoad: () => sheet.open({ loadOnly: true }),
      onGallery: () => app.replaceChildren(createGalleryScreen(galleryModel(meta, config), { onBack: showTitle }), sheet.el),
    });
    app.replaceChildren(title, sheet.el);
    title.querySelector('button')?.focus();
  }

  // ── 게임 시작 (save가 없으면 처음부터)
  async function startGame(save, jump = null) {
    sheet.close();
    const state = save ? save.state : createState(config);
    if (jump) jump.spec.apply(state);
    const clock = createClock();
    const speed = Number(params.get('speed'));
    if (speed > 0) clock.setSpeed(speed);

    let lastSave = null;
    let debug = null;
    const presenter = createPresenter({
      app,
      config,
      getState: () => state,
      clock,
      onTitle: toTitle,
      onChange: () => debug?.update(),
      onMenu: () => sheet.open(),
      getGallery: () => galleryModel(meta, config),
    });
    app.append(sheet.el);
    if (params.has('debug')) {
      debug = createDebugPanel(() => ({ state, lastSave, meta }));
      document.body.append(debug.el);
    }

    // 불러오기: 저장된 기록으로 대화방을 다시 만든 뒤, 저장 위치부터 진행
    const notices = [];
    if (jump) {
      notices.push(`QA 점프: ${jump.sceneId}부터${jump.spec.summary ? ` (${jump.spec.summary})` : ''}. 저장은 QA 전용 영역에 따로 됩니다.`);
      for (const e of jump.spec.errors) notices.push(`QA 상태 지정 오류: ${e}`);
    }
    if (!canStore) notices.push('이 브라우저에서는 저장할 수 없어 새로고침하면 처음부터 시작합니다 (사생활 보호 모드 등).');
    if (save) {
      const rebuilt = await rebuildRooms(state, loadScene, config);
      presenter.restore(rebuilt);
      if (rebuilt.missing) notices.push(`시나리오가 바뀌어 지난 대화 ${rebuilt.missing}개를 표시하지 못했습니다.`);
    }
    const sceneStart = presenter.sceneStart;
    let firstScene = true;
    presenter.sceneStart = (arg) => {
      sceneStart(arg);
      if (!firstScene) return;
      firstScene = false;
      if (save && !arg.resumed && arg.scene.sceneId === save.state.position.sceneId) notices.push('저장된 위치를 찾을 수 없어 이 장면 처음부터 다시 시작합니다.');
      for (const n of notices) presenter.showNotice(n, 'info');
    };

    const runner = createRunner({
      loadScene,
      presenter,
      clock,
      config,
      state,
      meta,
      hooks: {
        autosave(snapshot, reason) {
          const ok = writeSave(AUTO_KEY, snapshot, store);
          lastSave = { ...snapshot.position, reason, ok, at: new Date().toLocaleTimeString() };
          debug?.update();
        },
        onEnding() {
          // 엔딩 ID만 기록한다. 이 판은 끝났으므로 이어하기(자동 저장)는 지운다. 슬롯은 그대로 둔다.
          writeMeta(meta, store);
          removeSave(AUTO_KEY, store);
        },
        onError: (e) => console.error(e),
      },
    });
    game = { runner, presenter, clock };
    if (pauses.size) clock.pause();

    const sceneId = jump?.sceneId ?? 'prologue_s1';
    if (!parseSceneId(sceneId)) throw new Error(`잘못된 장면 ID: ${sceneId}`);
    const from = save ? save.state.position : { sceneId };
    try {
      await runner.run(from);
    } catch (e) {
      if (e.code === 'SCENE_LOAD' && e.sceneId !== from.sceneId) {
        // 집필 전인 다음 장면: 여기까지 진행한 상태(자동 저장 포함)를 두고 안전하게 멈춘다
        console.warn(e);
        presenter.showNotice(`다음 장면(${e.sceneId})은 아직 준비되지 않았습니다. 여기까지 진행했습니다.`, 'stop');
        return;
      }
      console.error(e);
      const hint = save
        ? ' — 저장된 장면을 불러오지 못했습니다. 타이틀에서 처음부터 시작하세요.'
        : dataParam ? '' : ' — 시나리오가 아직 없다면 ?data=_test/engine 으로 테스트 장면을 열 수 있습니다.';
      presenter.showNotice(`진행 중 오류: ${e.message}${hint}`);
    }
  }

  // ── 시작 지점: 게임 중 슬롯 불러오기 요청 > ?new=1 > 타이틀
  const loadKey = once.take('mvn.loadKey');
  if (loadKey) {
    const r = readSave(loadKey, store);
    if (r.ok) return startGame(r.save);
  }
  if (qaJump) {
    if (!parseSceneId(qaJump)) throw new Error(`잘못된 장면 ID: ${qaJump}`);
    return startGame(null, { sceneId: qaJump, spec: parseStateSpec(params.get('state'), config) });
  }
  if (params.has('new')) return startGame(null);
  showTitle();
}

main().catch((e) => {
  console.error(e);
  const hint = location.protocol === 'file:' ? ' 정적 서버로 열었는지 확인하세요.' : ' 테스트 장면은 ?data=_test/engine 으로 열 수 있습니다.';
  document.getElementById('app').textContent = `시작하지 못했습니다: ${e.message}.${hint}`;
});
