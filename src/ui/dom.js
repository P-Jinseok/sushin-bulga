// 작은 DOM 도우미

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// 게임 속 휴대폰 상태 표시줄. update(time, battery)로 갱신.
export function createStatusbar() {
  const time = h('span', {}, '');
  const pct = h('span', {}, '');
  const level = h('span', { class: 'battery__level' });
  const battery = h('span', { class: 'battery', 'aria-hidden': 'true' }, level);
  const el = h('div', { class: 'statusbar' }, time, h('span', { class: 'statusbar__battery' }, pct, battery));
  return {
    el,
    update(t, b = 100) {
      time.textContent = t ?? '';
      pct.textContent = `${b}%`;
      level.style.width = `calc(${b}% - 2px)`;
      battery.classList.toggle('battery--low', b <= 20);
    },
  };
}
