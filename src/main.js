// 진입점: 데이터 로드 → core 러너와 화면(presenter) 연결 → 플레이.
//
// URL 옵션 (개발·검증용):
//   ?data=_test/engine   장면 폴더를 scenario/_test/engine/ 으로 (기본: scenario/)
//   ?scene=prologue_s1   시작 장면 (기본: prologue_s1)
//   ?speed=2             텍스트 속도 배수 (기본 1)
//   ?debug=1             수치 확인 패널
//   ?mock=1              M2-1 화면 목업

import { createConfig } from './core/config.js';
import { createState } from './core/state.js';
import { createMeta } from './core/meta.js';
import { createClock } from './core/clock.js';
import { createRunner } from './core/runner.js';
import { parseSceneId } from './core/ids.js';
import { fetchJson, createSceneLoader } from './data/loader.js';
import { writeAutosave } from './save/storage.js';
import { createPresenter } from './ui/presenter.js';
import { createDebugPanel } from './ui/debug-panel.js';

const params = new URLSearchParams(location.search);

function dataBase() {
  const d = params.get('data');
  if (!d) return 'scenario/';
  if (!/^[a-z0-9_/-]+$/i.test(d) || d.includes('..')) throw new Error(`잘못된 data 경로: ${d}`);
  return `scenario/${d.replace(/\/?$/, '/')}`;
}

async function main() {
  const app = document.getElementById('app');

  const charactersData = await fetchJson('scenario/characters/characters.json');
  if (params.has('mock')) {
    const { renderMock } = await import('./ui/mock.js');
    return renderMock(app, charactersData);
  }

  const endingsData = await fetchJson('scenario/endings.json');
  const config = createConfig(charactersData, endingsData);
  const state = createState(config);
  const meta = createMeta(); // 영구 저장은 M2-8
  const clock = createClock();
  const speed = Number(params.get('speed'));
  if (speed > 0) clock.setSpeed(speed);

  // 탭 전환·화면 잠금 중에는 모든 대기(제한시간 포함)를 멈춘다
  document.addEventListener('visibilitychange', () => (document.hidden ? clock.pause() : clock.resume()));

  let lastSave = null;
  let debug = null;
  const presenter = createPresenter({
    app,
    config,
    getState: () => state,
    clock,
    onRestart: () => location.reload(),
    onChange: () => debug?.update(),
  });
  if (params.has('debug')) {
    debug = createDebugPanel(() => ({ state, lastSave }));
    document.body.append(debug.el);
  }

  const runner = createRunner({
    loadScene: createSceneLoader(dataBase()),
    presenter,
    clock,
    config,
    state,
    meta,
    hooks: {
      autosave(snapshot) {
        const ok = writeAutosave(snapshot);
        lastSave = { ...snapshot.position, ok, at: new Date().toLocaleTimeString() };
        debug?.update();
      },
      onError: (e) => console.error(e),
    },
  });

  const sceneId = params.get('scene') ?? 'prologue_s1';
  if (!parseSceneId(sceneId)) throw new Error(`잘못된 장면 ID: ${sceneId}`);
  try {
    await runner.run({ sceneId });
  } catch (e) {
    if (e.code === 'SCENE_LOAD' && e.sceneId !== sceneId) {
      // 집필 전인 다음 장면: 여기까지 진행한 상태(자동 저장 포함)를 두고 안전하게 멈춘다
      console.warn(e);
      presenter.showNotice(`다음 장면(${e.sceneId})은 아직 준비되지 않았습니다. 여기까지 진행했습니다.`, 'stop');
      return;
    }
    console.error(e);
    const hint = params.has('data') ? '' : ' — 시나리오가 아직 없다면 ?data=_test/engine 으로 테스트 장면을 열 수 있습니다.';
    presenter.showNotice(`진행 중 오류: ${e.message}${hint}`);
  }
}

main().catch((e) => {
  console.error(e);
  const hint = location.protocol === 'file:' ? ' 정적 서버로 열었는지 확인하세요.' : ' 테스트 장면은 ?data=_test/engine 으로 열 수 있습니다.';
  document.getElementById('app').textContent = `시작하지 못했습니다: ${e.message}.${hint}`;
});
