// 화면 설정 (M2-10): 글자 크기 3단계. 보는 사람마다의 편의 설정이라 data 폴더와 관계없이 하나만 저장한다.
// 저장소를 쓸 수 없으면 기본값으로 동작한다.

import { h } from './dom.js';

const KEY = 'mvn.settings';
export const TEXT_SIZES = [
  { id: 'small', label: '작게', px: 14 },
  { id: 'normal', label: '보통', px: 15 },
  { id: 'large', label: '크게', px: 17 },
];

export function readSettings() {
  try {
    const s = JSON.parse(globalThis.localStorage.getItem(KEY) ?? '{}');
    return { textSize: TEXT_SIZES.some((t) => t.id === s.textSize) ? s.textSize : 'normal' };
  } catch {
    return { textSize: 'normal' };
  }
}

function writeSettings(settings) {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}

export function applySettings(settings, root = document.documentElement) {
  const size = TEXT_SIZES.find((t) => t.id === settings.textSize) ?? TEXT_SIZES[1];
  root.style.setProperty('--fs', `${size.px}px`);
}

// "글자 크기 [작게][보통][크게]" 선택 줄
export function createTextSizeControl() {
  const settings = readSettings();
  const buttons = TEXT_SIZES.map((t) =>
    h('button', {
      class: 'seg__btn', type: 'button', 'aria-pressed': String(t.id === settings.textSize),
      onclick: () => {
        settings.textSize = t.id;
        writeSettings(settings);
        applySettings(settings);
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(TEXT_SIZES[i].id === t.id)));
      },
    }, t.label),
  );
  return h('div', { class: 'seg', role: 'group', 'aria-label': '글자 크기' }, h('span', { class: 'seg__label' }, '글자 크기'), buttons);
}
