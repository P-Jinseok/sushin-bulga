// effects 적용 (scenario-format 5절): set → delta(affection, clue, alert) → flags. 범위는 clamp.

import { getStat, setStat } from './state.js';

export function applyEffects(state, effects, config) {
  if (!effects) return;

  if (effects.set) {
    for (const [path, value] of statEntries(effects.set)) setStat(state, path, value, config);
  }
  for (const [path, delta] of statEntries(effects)) {
    setStat(state, path, getStat(state, path, config) + delta, config);
  }
  if (effects.flags) {
    for (const [name, value] of Object.entries(effects.flags)) state.flags[name] = value;
  }
}

// { affection: { harin: 1 }, clue: 1, alert: 1 } → [["affection.harin", 1], ["clue", 1], ["alert", 1]]
export function statEntries(obj) {
  const out = [];
  if (obj.affection) for (const [id, v] of Object.entries(obj.affection)) out.push([`affection.${id}`, v]);
  if ('clue' in obj) out.push(['clue', obj.clue]);
  if ('alert' in obj) out.push(['alert', obj.alert]);
  return out;
}
