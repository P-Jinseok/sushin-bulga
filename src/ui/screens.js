// 타이틀 화면, 엔딩 갤러리, 엔딩 화면 (M2-8).
// 엔딩 제목은 그 엔딩에 도달하기 전에는 화면(DOM)에 넣지 않는다. 갤러리는 core/meta.galleryModel()이
// 못 본 엔딩의 제목·유형·ID를 아예 담지 않으므로 여기서도 쓸 수 없다.

import { h } from './dom.js';
import { createTextSizeControl } from './settings.js';

export const TYPE_LABEL = { good: '굿 엔딩', normal: '노멀 엔딩', bad: '배드 엔딩', true: '트루 엔딩' };

// 타이틀. actions: { onStart, onContinue?, onLoad, onGallery }. autoText가 있으면 이어하기를 보여 준다.
export function createTitleScreen({ autoText, notices = [], onStart, onContinue, onLoad, onGallery }) {
  const menu = h('div', { class: 'title__menu' });
  const startButton = () =>
    h('button', {
      class: 'choice', type: 'button',
      onclick: () => {
        if (!autoText) return onStart();
        // 새로 시작하면 첫 장면 진입 때 자동 저장이 덮어써진다
        menu.replaceChildren(
          h('p', { class: 'title__ask' }, '새로 시작하면 이어하기 기록이 덮어써집니다.'),
          h('button', { class: 'choice', type: 'button', onclick: onStart }, '새로 시작'),
          h('button', { class: 'choice', type: 'button', onclick: renderMenu }, '취소'),
        );
        menu.querySelector('button').focus();
      },
    }, '처음부터');
  function renderMenu() {
    // replaceChildren은 null을 "null" 글자로 넣으므로 빈 항목은 걸러 낸다
    const items = [
      autoText ? h('button', { class: 'choice title__continue', type: 'button', onclick: onContinue }, '이어하기', h('span', { class: 'choice__hint' }, autoText)) : null,
      startButton(),
      h('button', { class: 'choice', type: 'button', onclick: onLoad }, '불러오기'),
      h('button', { class: 'choice', type: 'button', onclick: onGallery }, '엔딩 갤러리'),
    ];
    menu.replaceChildren(...items.filter(Boolean));
  }
  renderMenu();
  return h(
    'section',
    { class: 'screen title', 'aria-label': '타이틀' },
    h('div', { class: 'title__head' }, h('h1', { class: 'title__name' }, '수신 불가'), h('p', { class: 'title__sub' }, '(가제)')),
    menu,
    notices.length ? h('div', { class: 'title__notices' }, notices.map((n) => h('p', {}, n))) : null,
    // 저장소 삭제 위험 안내 (DEC-051)
    h('div', { class: 'title__settings' }, createTextSizeControl()),
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
        it.seen
          ? h('li', { class: `gallery__item gallery__item--${it.type}` }, h('span', { class: 'gallery__no' }, String(it.no)), h('span', { class: 'gallery__title' }, it.title), h('span', { class: 'gallery__type' }, TYPE_LABEL[it.type] ?? ''))
          : h('li', { class: 'gallery__item gallery__item--locked' }, h('span', { class: 'gallery__no' }, String(it.no)), h('span', { class: 'gallery__title' }, '???')),
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
