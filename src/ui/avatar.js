// 프로필 아바타. 먼저 컬러·이니셜 플레이스홀더를 그리고, image(ID)가 assets/manifest.json에 있으면 그 이미지를 불러와 바꾼다.
// image가 null이거나 표에 없거나 불러오지 못하면 플레이스홀더 그대로 (지시서 #20). 소재를 바꿀 때는 manifest·characters.json만 고친다.
// 이미지는 아바타가 그려질 때(그 방이 화면에 나올 때) 요청한다. 쓰이지 않는 변형(해금 전 J의 unlocked 등)은 요청하지 않는다.

import { imageUrl } from '../data/assets.js';

const failed = new Set(); // 한 번 실패한 URL은 다시 요청하지 않음

export function profileOf(character, variant = 'default') {
  const profiles = character?.profiles ?? {};
  return profiles[variant] ?? profiles.default ?? { color: '#888', icon: '?', image: null };
}

export function createAvatar(character, { variant = 'default', size = 'md' } = {}) {
  const p = profileOf(character, variant);
  const el = document.createElement('div');
  el.className = 'avatar' + (size === 'sm' ? ' avatar--sm' : '');
  el.style.setProperty('--avatar-color', p.color);
  if (p.accent) el.style.setProperty('--avatar-accent', p.accent);
  if (isLight(p.color)) el.classList.add('avatar--light');
  if (p.glitch) el.dataset.glitch = 'true'; // 글리치 연출은 M2-9

  el.textContent = p.icon ?? '?';
  const url = imageUrl(p.image);
  if (url && !failed.has(url)) {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => {
      el.replaceChildren(img);
      el.classList.add('avatar--img');
    };
    img.onerror = () => failed.add(url);
    img.src = url;
  }
  el.setAttribute('aria-hidden', 'true');
  return el;
}

// 배경색이 밝으면 글자를 어둡게 (대비 확보)
function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
