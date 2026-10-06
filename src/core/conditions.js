// 조건 문법 (scenario-format 6절): 평가와 문법 검사. 문법 검사는 lint와 공유한다.
//
// 조건     := 단일조건 | { all: [조건...] } | { any: [조건...] } | { not: 조건 }
// 단일조건 := { flag } | { flag, eq: bool } | { stat, gte|lte|eq: number } | { cleared: { ending } | { route, excludeTypes? } }

import { getFlag, getStat, parseStatPath } from './state.js';
import { ROUTES } from './ids.js';

const COMPARATORS = ['gte', 'lte', 'eq'];

// ctx: { state, config, meta }
export function evaluate(cond, ctx) {
  if ('all' in cond) return cond.all.every((c) => evaluate(c, ctx));
  if ('any' in cond) return cond.any.some((c) => evaluate(c, ctx));
  if ('not' in cond) return !evaluate(cond.not, ctx);
  if ('flag' in cond) {
    const want = 'eq' in cond ? cond.eq : true;
    return getFlag(ctx.state, cond.flag) === want;
  }
  if ('stat' in cond) {
    const v = getStat(ctx.state, cond.stat, ctx.config);
    if ('gte' in cond) return v >= cond.gte;
    if ('lte' in cond) return v <= cond.lte;
    return v === cond.eq;
  }
  if ('cleared' in cond) return isCleared(cond.cleared, ctx);
  throw new Error(`알 수 없는 조건: ${JSON.stringify(cond)}`);
}

function isCleared(c, { meta, config }) {
  const seen = meta?.seenEndings ?? [];
  if (c.ending) return seen.includes(c.ending);
  const exclude = c.excludeTypes ?? [];
  return seen.some((id) => {
    const e = config.endings.get(id);
    return e && e.route === c.route && !exclude.includes(e.type);
  });
}

// 문법·참조 검사. 문제 목록(문자열 배열)을 반환한다. 빈 배열이면 유효.
// ctx(선택): { config, endingTypes } — 주면 stat 경로·엔딩 id·route·유형까지 검사한다.
export function validateCondition(cond, ctx = {}, path = 'if') {
  const errors = [];
  const err = (msg) => errors.push(`${path}: ${msg}`);
  if (cond === null || typeof cond !== 'object' || Array.isArray(cond)) {
    err('조건은 객체여야 함');
    return errors;
  }
  const keys = Object.keys(cond);
  const combinator = ['all', 'any', 'not'].filter((k) => k in cond);
  const leaf = ['flag', 'stat', 'cleared'].filter((k) => k in cond);

  if (combinator.length + leaf.length !== 1) {
    err(`조합자/단일조건 키가 정확히 하나여야 함 (현재: ${keys.join(', ') || '없음'})`);
    return errors;
  }

  if (combinator.length) {
    const k = combinator[0];
    if (keys.length !== 1) err(`${k}와 함께 쓸 수 없는 키: ${keys.filter((x) => x !== k).join(', ')}`);
    if (k === 'not') {
      errors.push(...validateCondition(cond.not, ctx, `${path}.not`));
    } else if (!Array.isArray(cond[k]) || cond[k].length === 0) {
      err(`${k}는 비어 있지 않은 배열이어야 함`);
    } else {
      cond[k].forEach((c, i) => errors.push(...validateCondition(c, ctx, `${path}.${k}[${i}]`)));
    }
    return errors;
  }

  const k = leaf[0];
  if (k === 'flag') {
    if (typeof cond.flag !== 'string' || !cond.flag) err('flag는 문자열이어야 함');
    const extra = keys.filter((x) => x !== 'flag' && x !== 'eq');
    if (extra.length) err(`flag 조건에 쓸 수 없는 키: ${extra.join(', ')}`);
    if ('eq' in cond && typeof cond.eq !== 'boolean') err('flag의 eq는 true/false여야 함');
  } else if (k === 'stat') {
    const comps = COMPARATORS.filter((c) => c in cond);
    if (comps.length !== 1) err(`stat 조건에는 비교자(gte/lte/eq)가 정확히 하나 필요 (현재 ${comps.length}개)`);
    for (const c of comps) if (typeof cond[c] !== 'number') err(`${c} 값은 숫자여야 함`);
    const extra = keys.filter((x) => x !== 'stat' && !COMPARATORS.includes(x));
    if (extra.length) err(`stat 조건에 쓸 수 없는 키: ${extra.join(', ')}`);
    if (typeof cond.stat !== 'string') err('stat은 문자열이어야 함');
    else if (ctx.config && !parseStatPath(cond.stat, ctx.config)) err(`잘못된 stat 경로 "${cond.stat}"`);
  } else {
    if (keys.length !== 1) err(`cleared와 함께 쓸 수 없는 키: ${keys.filter((x) => x !== 'cleared').join(', ')}`);
    const c = cond.cleared;
    if (!c || typeof c !== 'object') {
      err('cleared는 객체여야 함');
    } else if ('ending' in c) {
      if (Object.keys(c).length !== 1) err('cleared.ending은 단독으로 써야 함');
      if (ctx.config && !ctx.config.endings.has(c.ending)) err(`엔딩 "${c.ending}"이 endings.json에 없음`);
    } else if ('route' in c) {
      const extra = Object.keys(c).filter((x) => x !== 'route' && x !== 'excludeTypes');
      if (extra.length) err(`cleared에 쓸 수 없는 키: ${extra.join(', ')}`);
      if (!ROUTES.includes(c.route)) err(`잘못된 route "${c.route}"`);
      if ('excludeTypes' in c) {
        if (!Array.isArray(c.excludeTypes)) err('excludeTypes는 배열이어야 함');
        else if (ctx.endingTypes)
          for (const t of c.excludeTypes) if (!ctx.endingTypes.includes(t)) err(`엔딩 유형 "${t}"이 endings.json types에 없음`);
      }
    } else {
      err('cleared에는 ending 또는 route가 필요');
    }
  }
  return errors;
}

// 조건 안에서 참조하는 플래그 이름 목록 (lint의 "설정되지 않은 플래그" 검사용)
export function collectFlags(cond, out = []) {
  if (!cond || typeof cond !== 'object') return out;
  if (Array.isArray(cond.all)) cond.all.forEach((c) => collectFlags(c, out));
  if (Array.isArray(cond.any)) cond.any.forEach((c) => collectFlags(c, out));
  if (cond.not) collectFlags(cond.not, out);
  if (typeof cond.flag === 'string') out.push(cond.flag);
  return out;
}

// 조건 안에서 stat: alert를 검사하는지 (lint의 체크포인트 검사용)
export function checksStat(cond, statPath) {
  if (!cond || typeof cond !== 'object') return false;
  if (cond.stat === statPath) return true;
  if (Array.isArray(cond.all) && cond.all.some((c) => checksStat(c, statPath))) return true;
  if (Array.isArray(cond.any) && cond.any.some((c) => checksStat(c, statPath))) return true;
  return checksStat(cond.not, statPath);
}
