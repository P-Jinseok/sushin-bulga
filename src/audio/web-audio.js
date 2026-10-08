// Web Audio 재생 장치 (지시서 #20). 짧은 효과음을 미리 해독해 두고 겹쳐 재생한다.
// - iOS·안드로이드는 사용자 입력 안에서 AudioContext를 resume해야 소리가 난다 → unlock()을 첫 탭에서 부른다
// - iOS의 무음 스위치가 켜져 있으면 Web Audio 소리는 나지 않는다 (기기 정책, device-check 문서 참고)
// - AudioContext를 만들 수 없으면 소리 없는 장치로 동작한다

import { silentBackend } from './audio.js';

export function createWebAudioBackend() {
  const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctx) return silentBackend;
  let ctx = null;
  const playing = new Set();
  const context = () => (ctx ??= new Ctx());

  return {
    unlock() {
      const c = context();
      if (c.state === 'suspended') c.resume().catch(() => {});
      // 일부 iOS 버전은 입력 안에서 한 번 소리를 내야 열린다: 길이 1 샘플의 무음
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    },

    async load(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      return await new Promise((resolve, reject) => context().decodeAudioData(data, resolve, reject));
    },

    play(buffer, volume) {
      const c = context();
      if (c.state === 'suspended') c.resume().catch(() => {});
      const src = c.createBufferSource();
      const gain = c.createGain();
      src.buffer = buffer;
      gain.gain.value = volume;
      src.connect(gain).connect(c.destination);
      src.onended = () => playing.delete(src);
      playing.add(src);
      src.start(0);
    },

    stopAll() {
      for (const src of playing) {
        try {
          src.stop();
        } catch {}
      }
      playing.clear();
    },
  };
}
