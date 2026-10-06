// characters.json → 엔진 설정. 수치 범위·호감도 대상·대화방은 코드에 하드코딩하지 않는다.

export function createConfig(charactersData, endingsData = { endings: [] }) {
  const characters = new Map(charactersData.characters.map((c) => [c.id, c]));
  const s = charactersData.stats;
  return {
    characters,
    rooms: [...charactersData.rooms],
    affectionTargets: [...s.affection.targets],
    ranges: {
      affection: { min: s.affection.min, max: s.affection.max },
      clue: { min: s.clue.min, max: s.clue.max },
      alert: { min: s.alert.min, max: s.alert.max },
    },
    endings: new Map(endingsData.endings.map((e) => [e.id, e])),
    playerId: charactersData.characters.find((c) => c.role === 'player')?.id ?? 'dohha',
    systemId: charactersData.characters.find((c) => c.role === 'system')?.id ?? 'system',
  };
}
