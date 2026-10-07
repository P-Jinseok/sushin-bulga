// ?debug=1 일 때만 표시되는 수치 확인 패널 (M2-5 검증용)

import { h } from './dom.js';

export function createDebugPanel(getInfo) {
  const pre = h('pre', { class: 'debug-panel__body' });
  const el = h(
    'details',
    { class: 'debug-panel' },
    h('summary', {}, 'debug'),
    pre,
  );
  return {
    el,
    update() {
      const { state, lastSave, meta } = getInfo();
      pre.textContent = JSON.stringify(
        {
          position: state.position,
          clock: state.clock,
          stats: state.stats,
          flags: state.flags,
          contacts: state.contacts,
          lastAutosave: lastSave,
          seenEndings: meta?.seenEndings,
        },
        null,
        1,
      );
    },
  };
}
