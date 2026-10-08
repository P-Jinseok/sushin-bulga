// 타이틀 화면, 엔딩 갤러리, 엔딩 화면 (M2-8).
// 엔딩 제목은 그 엔딩에 도달하기 전에는 화면(DOM)에 넣지 않는다. 갤러리는 core/meta.galleryModel()이
// 못 본 엔딩의 제목·유형·ID를 아예 담지 않으므로 여기서도 쓸 수 없다.

import { h } from './dom.js';
import { createTextSizeControl, createSoundControl } from './settings.js';

export const TYPE_LABEL = { good: '굿 엔딩', normal: '노멀 엔딩', bad: '배드 엔딩', true: '트루 엔딩' };

// 타이틀. actions: { onStart, onContinue?, onLoad, onGallery }. autoText가 있으면 이어하기를 보여 준다.
// special(선택): 해금된 추가 항목 { avatar, name, onStart } — J 루트 진입 (지시서 #14). 해금 전에는 넘기지 않아 DOM에도 없다
// announce(선택): 타이틀 위쪽에 한 번 보여 줄 안내 (예: 해금 알림)
// onCredits(선택): 크레딧 항목이 있을 때만 넘긴다 → "크레딧" 메뉴 (지시서 #20)
export function createTitleScreen({ autoText, notices = [], onStart, onContinue, onLoad, onGallery, special = null, announce = null, onCredits = null }) {
  const menu = h('div', { class: 'title__menu' });
  // 새로 시작하면 첫 장면 진입 때 자동 저장이 덮어써지므로, 이어하기가 있으면 한 번 더 묻는다
  const confirmNew = (go) => () => {
    if (!autoText) return go();
    menu.replaceChildren(
      h('p', { class: 'title__ask' }, '새로 시작하면 이어하기 기록이 덮어써집니다.'),
      h('button', { class: 'choice', type: 'button', onclick: go }, '새로 시작'),
      h('button', { class: 'choice', type: 'button', onclick: renderMenu }, '취소'),
    );
    menu.querySelector('button').focus();
  };
  const startButton = () => h('button', { class: 'choice', type: 'button', onclick: confirmNew(onStart) }, '처음부터');
  const specialButton = () =>
    special
      ? h('button', { class: 'choice title__special', type: 'button', onclick: confirmNew(special.onStart), 'aria-label': `${special.name}에서 온 연락` },
          special.avatar, h('span', { class: 'title__special-name' }, special.name))
      : null;
  function renderMenu() {
    // replaceChildren은 null을 "null" 글자로 넣으므로 빈 항목은 걸러 낸다
    const items = [
      autoText ? h('button', { class: 'choice title__continue', type: 'button', onclick: onContinue }, '이어하기', h('span', { class: 'choice__hint' }, autoText)) : null,
      startButton(),
      specialButton(),
      h('button', { class: 'choice', type: 'button', onclick: onLoad }, '불러오기'),
      h('button', { class: 'choice', type: 'button', onclick: onGallery }, '엔딩 갤러리'),
      onCredits ? h('button', { class: 'choice title__credits', type: 'button', onclick: onCredits }, '크레딧') : null,
    ];
    menu.replaceChildren(...items.filter(Boolean));
  }
  renderMenu();
  return h(
    'section',
    { class: 'screen title', 'aria-label': '타이틀' },
    announce ? h('p', { class: 'title__announce', role: 'status' }, announce) : null,
    h('div', { class: 'title__head' }, h('h1', { class: 'title__name' }, '수신 불가'), h('p', { class: 'title__sub' }, '(가제)')),
    menu,
    notices.length ? h('div', { class: 'title__notices' }, notices.map((n) => h('p', {}, n))) : null,
    // 저장소 삭제 위험 안내 (DEC-051)
    h('div', { class: 'title__settings' }, createTextSizeControl(), createSoundControl()),
    h('p', { class: 'title__storage' }, '이 브라우저에 저장됩니다. 오래 접속하지 않으면 기록이 지워질 수 있어요'),
  );
}

// 갤러리. model: core/meta.galleryModel() 결과
export function createGalleryScreen(model, { onBack }) {
  return h(
    'section',
    { class: 'screen gallery', 'aria-label': '엔딩 갤러리' },
    h('header', { class: 'list-header' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '타이틀로', onclick: onBack }, '‹'), h('span', {}, '엔딩 갤러리'), h('span', { class: 'gallery__count' }, `${model.seen} / ${model.total}`)),
    h(
      'ol',
      { class: 'gallery__list' },
      model.items.map((it) =>
        // 본 엔딩: 제목 아래 요약(summary), 못 본 엔딩: ??? 아래 조건 암시(hint). 문구가 없으면 줄을 만들지 않는다 (지시서 #12)
        it.seen
          ? h('li', { class: `gallery__item gallery__item--${it.type}` }, h('span', { class: 'gallery__no' }, String(it.no)),
              h('span', { class: 'gallery__main' }, h('span', { class: 'gallery__title' }, it.title), it.summary ? h('span', { class: 'gallery__sub' }, it.summary) : null),
              h('span', { class: 'gallery__type' }, TYPE_LABEL[it.type] ?? ''))
          : h('li', { class: 'gallery__item gallery__item--locked' }, h('span', { class: 'gallery__no' }, String(it.no)),
              h('span', { class: 'gallery__main' }, h('span', { class: 'gallery__title' }, '???'), it.hint ? h('span', { class: 'gallery__sub gallery__hint' }, it.hint) : null)),
      ),
    ),
  );
}

// 크레딧. items: assets/credits.json의 항목 { id, title, author, source, license, checked, note } (지시서 #20)
export function createCreditsScreen(items, { onBack }) {
  return h(
    'section',
    { class: 'screen gallery credits', 'aria-label': '크레딧' },
    h('header', { class: 'list-header' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '타이틀로', onclick: onBack }, '‹'), h('span', {}, '크레딧')),
    h(
      'ul',
      { class: 'gallery__list credits__list' },
      items.map((c) =>
        h('li', { class: 'gallery__item credits__item' },
          h('span', { class: 'gallery__main' },
            h('span', { class: 'gallery__title' }, c.title || c.id),
            h('span', { class: 'gallery__sub' }, [c.author, c.license].filter(Boolean).join(' · ')),
            c.source ? h('span', { class: 'gallery__sub credits__source' }, c.source) : null,
            c.note ? h('span', { class: 'gallery__sub' }, c.note) : null)),
      ),
    ),
  );
}

// 엔딩 화면 (대화방 위에 겹쳐 표시). 제목·종류만, isNew면 "새 엔딩" 표시.
export function createEndingScreen({ endingId, ending, isNew, seen, total, onTitle }) {
  const el = h(
    'div',
    { class: `ending-screen ending-screen--${ending?.type ?? 'unknown'}`, role: 'dialog', 'aria-label': '엔딩' },
    h(
      'div',
      { class: 'ending-screen__card' },
      h('p', { class: 'ending-screen__type' }, TYPE_LABEL[ending?.type] ?? '엔딩'),
      h('h2', { class: 'ending-screen__title' }, ending?.title ?? '엔딩'),
      // 엔딩 ID는 표시하지 않는다 (ID 접두어로 루트를 짐작할 수 있음, DEC-050)
      isNew ? h('p', { class: 'ending-screen__meta' }, h('span', { class: 'ending-screen__new' }, '새 엔딩')) : null,
      h('p', { class: 'ending-screen__count' }, `엔딩 갤러리 ${seen} / ${total}`),
      h('button', { class: 'choice', type: 'button', onclick: onTitle }, '타이틀로'),
    ),
  );
  return el;
}
