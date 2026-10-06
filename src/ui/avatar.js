// 프로필 아바타. image가 null이면 컬러·이니셜 플레이스홀더, 값이 있으면 assets/profiles/의 이미지.
// 일러스트를 교체할 때는 characters.json의 image 값만 바꾸면 된다.

const PROFILE_DIR = 'assets/profiles/';

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

  if (p.image) {
    const img = document.createElement('img');
    img.src = PROFILE_DIR + p.image;
    img.alt = '';
    img.onerror = () => img.replaceWith(document.createTextNode(p.icon ?? '?'));
    el.append(img);
  } else {
    el.textContent = p.icon ?? '?';
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
