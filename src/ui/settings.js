// 화면 설정 (M2-10): 글자 크기 3단계. 보는 사람마다의 편의 설정이라 data 폴더와 관계없이 하나만 저장한다.
// 소리 (지시서 #20): 켬/끔, 볼륨 0~100 (기본 켬·60). 같은 키(mvn.settings)에 함께 저장한다.
// 이전 형식({ textSize }만 있음)은 소리 기본값으로 읽는다. 저장소를 쓸 수 없으면 기본값으로 동작한다.
// 움직임 줄이기는 기기 설정(prefers-reduced-motion)을 따르며 소리와 관계없다.

import { h } from './dom.js';

const KEY = 'mvn.settings';
export const TEXT_SIZES = [
  { id: 'small', label: '작게', px: 14 },
  { id: 'normal', label: '보통', px: 15 },
  { id: 'large', label: '크게', px: 17 },
];

export const DEFAULT_SETTINGS = { textSize: 'normal', soundOn: true, volume: 60 };

export function normalizeSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const vol = Number(o.volume);
  return {
    textSize: TEXT_SIZES.some((t) => t.id === o.textSize) ? o.textSize : DEFAULT_SETTINGS.textSize,
    soundOn: typeof o.soundOn === 'boolean' ? o.soundOn : DEFAULT_SETTINGS.soundOn,
    volume: Number.isFinite(vol) ? Math.min(100, Math.max(0, Math.round(vol))) : DEFAULT_SETTINGS.volume,
  };
}

// storage를 넘기지 않으면 localStorage. 접근 자체가 예외인 브라우저(사생활 보호 모드 등)가 있어 try 안에서 꺼낸다
const storageOf = (storage) => storage ?? globalThis.localStorage;

export function readSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storageOf(storage).getItem(KEY) ?? '{}'));
  } catch {
    return memory ?? { ...DEFAULT_SETTINGS };
  }
}

const listeners = new Set();
// 설정이 바뀌면 fn(설정 전체)을 부른다 (main이 소리 설정을 오디오에 반영). 해제 함수를 돌려준다
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 바꾼 항목만 넘겨도 된다. 저장한 전체 설정을 돌려준다 (저장소를 못 쓰면 이번 실행 동안만 유지)
let memory = null;
export function writeSettings(patch, storage) {
  let current;
  try {
    current = normalizeSettings(JSON.parse(storageOf(storage).getItem(KEY) ?? '{}'));
  } catch {
    current = memory ?? { ...DEFAULT_SETTINGS };
  }
  const next = normalizeSettings({ ...current, ...patch });
  memory = next;
  try {
    storageOf(storage).setItem(KEY, JSON.stringify(next));
  } catch {}
  for (const fn of listeners) fn(next);
  return next;
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
        applySettings(writeSettings({ textSize: t.id }));
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(TEXT_SIZES[i].id === t.id)));
      },
    }, t.label),
  );
  return h('div', { class: 'seg', role: 'group', 'aria-label': '글자 크기' }, h('span', { class: 'seg__label' }, '글자 크기'), buttons);
}

// "소리 [켬] ───●── 60" 줄. 바뀐 값은 onSettingsChange 구독자(main → 오디오)에게 전달된다
export function createSoundControl() {
  const settings = readSettings();
  const toggle = h('button', { class: 'seg__btn sound__toggle', type: 'button', 'aria-pressed': String(settings.soundOn) }, settings.soundOn ? '켬' : '끔');
  const value = h('span', { class: 'sound__value' }, String(settings.volume));
  const range = h('input', { class: 'sound__range', type: 'range', min: '0', max: '100', step: '5', value: String(settings.volume), 'aria-label': '볼륨' });
  const sync = () => {
    toggle.setAttribute('aria-pressed', String(settings.soundOn));
    toggle.textContent = settings.soundOn ? '켬' : '끔';
    range.disabled = !settings.soundOn;
    value.textContent = String(settings.volume);
  };
  const save = (patch) => {
    Object.assign(settings, writeSettings(patch));
    sync();
  };
  toggle.addEventListener('click', () => save({ soundOn: !settings.soundOn }));
  range.addEventListener('input', () => save({ volume: Number(range.value) }));
  sync();
  return h('div', { class: 'seg sound', role: 'group', 'aria-label': '소리' }, h('span', { class: 'seg__label' }, '소리'), toggle, range, value);
}
