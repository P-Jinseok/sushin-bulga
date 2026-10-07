// QA 전용 장면 점프의 상태 지정 (DEC-059). `?debug=1&scene=<sceneId>&state=<목록>`에서만 쓴다.
//
// 목록 형식 (쉼표로 구분):
//   affection.harin:5   clue:2   alert:1   수치 (범위를 넘으면 clamp)
//   battery:15                          배터리
//   clue_harin_1   met_harin            플래그 true
//   met_harin:false                     플래그 false
//   contact.harin                       연락처 이름을 표시 이름(displayName) 대신 실제 이름으로
//   day:화요일   time:22:30              게임 속 요일·시각 (장면에 time/day가 있으면 장면 값이 우선)

import { parseStatPath, setStat } from './state.js';

const FLAG_NAME = /^[a-z][a-z0-9_]*$/;

// { apply(state), errors: string[], summary: string }
export function parseStateSpec(spec, config) {
  const steps = [];
  const errors = [];
  const shown = [];
  for (const raw of (spec ?? '').split(',').map((t) => t.trim()).filter(Boolean)) {
    const i = raw.indexOf(':');
    const key = i < 0 ? raw : raw.slice(0, i);
    const value = i < 0 ? null : raw.slice(i + 1);

    if (parseStatPath(key, config)) {
      const n = Number(value);
      if (value === null || !Number.isFinite(n)) errors.push(`${raw}: 수치에는 숫자가 필요 (예: ${key}:3)`);
      else steps.push((s) => setStat(s, key, n, config)), shown.push(`${key}=${n}`);
    } else if (key === 'battery') {
      const n = Number(value);
      if (!Number.isFinite(n)) errors.push(`${raw}: battery에는 숫자가 필요`);
      else steps.push((s) => (s.battery = Math.min(100, Math.max(0, n)))), shown.push(`battery=${n}`);
    } else if (key === 'day' || key === 'time') {
      if (!value) errors.push(`${raw}: 값이 필요`);
      else steps.push((s) => (s.clock[key] = value)), shown.push(`${key}=${value}`);
    } else if (key.startsWith('contact.')) {
      const id = key.slice(8);
      const c = config.characters.get(id);
      if (!c) errors.push(`${raw}: 캐릭터 "${id}" 없음`);
      else steps.push((s) => (s.contacts[id] = { ...(s.contacts[id] ?? {}), name: c.name })), shown.push(`연락처 ${c.name}`);
    } else if (FLAG_NAME.test(key) && (value === null || value === 'true' || value === 'false')) {
      const on = value !== 'false';
      steps.push((s) => (s.flags[key] = on));
      shown.push(on ? key : `${key}=false`);
    } else {
      errors.push(`${raw}: 알 수 없는 항목`);
    }
  }
  return {
    apply(state) {
      for (const step of steps) step(state);
      return state;
    },
    errors,
    summary: shown.join(', '),
  };
}
