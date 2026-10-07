// 연출 fx 렌더링 (M2-9). 상태 변경(읽음·시각·삭제·전송 실패·배터리)은 core runner가 하고,
// 여기서는 화면 표시만 한다. 지속 시간은 게임 시계(clock.wait)로 재므로 일시정지·탭해서 넘기기·async가
// 이야기 진행과 같이 동작한다.
//
// 접근성 규칙:
// - 번쩍임(밝기 급변)을 쓰지 않는다. 흔들림·어긋남은 위치 이동이고, 화면 글리치도 초당 3번만 움직인다.
// - prefers-reduced-motion이면 움직임 없는 고정 표시로 바꾼다 (CSS에서 처리, 이름 글리치는 글자 섞기 생략).

const GLITCH_CHARS = '#%&*?!/\\░▒▓';

export function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// hooks: { frame, nameElFor(room), setTyping(room, speaker|null), showDay(room, day), statusChanged() }
export function createFx({ clock, hooks }) {
  const wait = (ms) => clock.wait(ms ?? 0);
  let kept = null; // 엔딩까지 유지 중인 암전 요소

  // 표시 이름 글자 섞기. 원래 글자 길이는 유지하고 일부만 바꾼다 (읽을 수 있을 정도로)
  async function glitchName(room, ms) {
    const el = hooks.nameElFor(room);
    if (!el) return wait(ms);
    const original = el.textContent;
    el.classList.add('fx-glitch-name');
    let timer = 0;
    if (!prefersReducedMotion()) {
      timer = setInterval(() => {
        el.textContent = [...original].map((c) => (c !== ' ' && Math.random() < 0.35 ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] : c)).join('');
      }, 120);
    }
    await wait(ms);
    clearInterval(timer);
    // 그 사이 화면이 다시 그려졌으면(방 이동 등) 그 요소는 이미 원래 이름이다
    if (el.isConnected) {
      el.textContent = original;
      el.classList.remove('fx-glitch-name');
    }
  }

  async function frameClass(cls, ms) {
    hooks.frame.classList.add(cls);
    await wait(ms);
    hooks.frame.classList.remove(cls);
  }

  // keep: 엔딩까지 시스템 문구만 남았으면 암전을 유지한다 (엔딩 카드가 그 위에 뜸, DEC-053·DEC-057).
  // reduced-motion에서도 같음 (고정 어둠)
  async function blackout(ms, keep) {
    const el = document.createElement('div');
    el.className = 'fx-blackout';
    el.setAttribute('aria-hidden', 'true');
    hooks.frame.append(el);
    el.getBoundingClientRect(); // 전환 시작점 확정
    el.classList.add('is-on');
    await wait(ms);
    if (keep) {
      el.classList.add('is-kept');
      kept = el;
      return;
    }
    el.classList.remove('is-on');
    setTimeout(() => el.remove(), prefersReducedMotion() ? 0 : 400); // 밝아지는 전환 뒤 제거
  }

  async function typing(room, ms) {
    hooks.setTyping(room, room); // 대화방 id = 상대 캐릭터 id
    await wait(ms);
    hooks.setTyping(room, null);
  }

  return {
    get hasTitleDrop() {
      return !!kept?.isConnected && !!kept.querySelector('.fx-title-drop');
    },

    // 유지 중인 암전 위에 시스템 문구를 띄운다 (타이틀 드롭, DEC-057). 암전이 없으면 false
    titleDrop(text) {
      if (!kept?.isConnected) return false;
      const line = document.createElement('p');
      line.className = 'fx-title-drop';
      line.textContent = text;
      kept.append(line);
      return true;
    },

    // 화면 연출을 시작하고, 끝나면 resolve되는 Promise를 돌려준다 (해당 없는 kind는 undefined)
    run(node, room, { nextType, leadsToEnding } = {}) {
      switch (node.kind) {
        case 'glitch':
          if (node.target === 'screen') return frameClass('fx-glitch-screen', node.duration);
          if (node.target === 'name' || node.target === 'profile') return glitchName(room, node.duration);
          return hooks.glitchBubble?.(node.target, () => wait(node.duration)) ?? wait(node.duration);
        case 'shake':
          return frameClass('fx-shake', node.duration);
        case 'blackout':
          return blackout(node.duration, leadsToEnding ?? nextType === 'ending');
        case 'typing':
          return typing(room, node.duration);
        case 'time_jump':
          if (node.day) hooks.showDay(room, node.day);
          hooks.statusChanged();
          return undefined;
        case 'battery':
          hooks.statusChanged();
          return undefined;
        default:
          return undefined; // notify·read·delete_msg·send_fail은 presenter가 상태를 반영. call_alert는 M2 후반
      }
    },
  };
}
