// 효과음 관리 (지시서 #20). 재생 장치(backend)와 분리해 DOM·오디오 없이 node --test로 검증한다.
//
// 큐 정의: assets/sfx/cues.json  { "<큐 ID>": { "file": "msg_in.mp3" | ["a.ogg", "a.mp3"] | null, "volume": 1.0, "cooldownMs": 80, "enabled": true } }
//   - file이 null이거나 비어 있으면 그 큐는 비활성 (소재가 아직 없음). 배열이면 앞에서부터 불러지는 것을 쓴다 (MP3·OGG)
//   - 파일을 불러오지 못하면(없음·해독 실패) 그 큐는 조용히 비활성
//   - enabled: false면 재생하지 않음 (typing 등 기본 꺼짐 큐)
// 규칙
//   - 첫 사용자 입력(unlock) 전에는 재생하지 않는다 (모바일 자동 재생 정책)
//   - 같은 큐는 cooldownMs 안에 다시 울리지 않는다 (빠른 속도에서 한꺼번에 쏟아지지 않게)
//   - 소리 끔·숨김(탭 전환·화면 꺼짐)·복원 중(quiet)에는 재생하지 않는다
//   - 최종 볼륨 = 설정 볼륨(0~100)/100 × 큐 volume × 호출 배율(새벽 알림 0.5 등)
//
// backend 인터페이스: { unlock(): void, load(url): Promise<handle>, play(handle, volume): void, stopAll(): void }

export const SFX_BASE = 'assets/sfx/';

export function parseCues(data) {
  const cues = new Map();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return cues;
  for (const [id, c] of Object.entries(data)) {
    if (!c || typeof c !== 'object') continue;
    const files = (Array.isArray(c.file) ? c.file : [c.file]).filter((f) => typeof f === 'string' && f.trim());
    cues.set(id, {
      files,
      volume: Number.isFinite(c.volume) ? Math.max(0, c.volume) : 1,
      cooldownMs: Number.isFinite(c.cooldownMs) ? Math.max(0, c.cooldownMs) : 80,
      enabled: c.enabled !== false,
    });
  }
  return cues;
}

export function createAudioManager({ backend, cues = new Map(), now = () => Date.now(), base = SFX_BASE, settings = { soundOn: true, volume: 60 } } = {}) {
  let unlocked = false;
  let hidden = false;
  let quiet = 0;
  let soundOn = settings.soundOn !== false;
  let volume = clampVolume(settings.volume);
  const lastAt = new Map(); // 큐 → 마지막 재생 시각
  const handles = new Map(); // 큐 → Promise<handle | null>

  // 큐의 소리를 한 번만 불러온다. 파일 후보를 차례로 시도하고, 모두 실패하면 null (비활성)
  function handleOf(id, cue) {
    if (!handles.has(id)) {
      handles.set(
        id,
        (async () => {
          for (const f of cue.files) {
            try {
              return await backend.load(base + f);
            } catch {}
          }
          return null;
        })(),
      );
    }
    return handles.get(id);
  }

  const canPlay = () => unlocked && soundOn && volume > 0 && !hidden && quiet === 0;

  return {
    // 첫 사용자 입력에서 부른다
    unlock() {
      if (unlocked) return;
      unlocked = true;
      try {
        backend.unlock();
      } catch {}
    },

    // 큐 재생. 실제로 재생을 시작했으면(불러오기 대기 포함) true
    play(id, { gain = 1 } = {}) {
      const cue = cues.get(id);
      if (!cue || !cue.enabled || cue.files.length === 0 || !canPlay()) return false;
      const t = now();
      if (lastAt.has(id) && t - lastAt.get(id) < cue.cooldownMs) return false;
      lastAt.set(id, t);
      const v = (volume / 100) * cue.volume * gain;
      handleOf(id, cue).then((handle) => {
        // 불러오는 사이에 꺼졌거나 숨겨졌으면 울리지 않는다
        if (handle && canPlay()) {
          try {
            backend.play(handle, v);
          } catch {}
        }
      });
      return true;
    },

    setSound({ soundOn: on = soundOn, volume: vol = volume } = {}) {
      soundOn = on !== false;
      volume = clampVolume(vol);
      if (!soundOn || volume === 0) stop();
    },

    // 탭이 숨겨지거나 화면이 꺼지면 멈춘다
    setHidden(on) {
      hidden = !!on;
      if (hidden) stop();
    },

    // fn 실행 중(세이브 복원 등)에는 재생하지 않는다. 중첩 가능
    async quietly(fn) {
      quiet++;
      try {
        return await fn();
      } finally {
        quiet--;
      }
    },

    get state() {
      return { unlocked, hidden, quiet: quiet > 0, soundOn, volume };
    },
  };

  function stop() {
    try {
      backend.stopAll();
    } catch {}
  }
}

function clampVolume(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 60;
}

// 소리 없는 backend (오디오를 쓸 수 없는 환경)
export const silentBackend = {
  unlock() {},
  load: async () => null,
  play() {},
  stopAll() {},
};

// ── 게임 사건 → 큐 (presenter가 쓴다) ──
// fx 종류별 큐. typing은 cues.json에서 기본 꺼짐(enabled: false)
export const FX_CUES = new Set(['glitch', 'shake', 'blackout', 'send_fail', 'time_jump', 'delete_msg', 'typing']);
export const DAWN_GAIN = 0.5;

// 장면 시각 "HH:MM"이 새벽(00:00~05:59)이면 true. 새벽 알림은 볼륨을 낮춘다 (기획서 5-3)
export function isDawn(time) {
  const m = /^(\d{1,2}):\d{2}$/.exec(time ?? '');
  return !!m && Number(m[1]) < 6;
}
