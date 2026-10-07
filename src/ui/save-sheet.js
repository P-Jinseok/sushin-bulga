// 저장·불러오기 화면 (M2-7). 타이틀에서 열면 불러오기만 (M2-8).
// - 자동 저장 1개(불러오기만) + 수동 슬롯 3개(저장·불러오기). 덮어쓰기·불러오기는 화면 안에서 한 번 더 확인한다
//   (브라우저 confirm 창은 쓰지 않음).
// - 열려 있는 동안 게임 시계를 멈춘다 (onOpen/onClose에서 main이 처리).

import { h } from './dom.js';
import { createTextSizeControl } from './settings.js';

const REASON_TEXT = { none: '비어 있음', corrupt: '읽을 수 없는 저장', version: '이전 버전 저장 (사용 불가)', unavailable: '저장소를 쓸 수 없음' };

// entries: storage.listSaves() 결과, describe(save) → 표시 문자열, canSave() → 지금 저장 가능 여부
export function createSaveSheet({ getEntries, describe, canSave, onSave, onLoad, onOpen, onClose }) {
  const list = h('div', { class: 'sheet__list' });
  const note = h('p', { class: 'sheet__note' });
  const panel = h(
    'div',
    { class: 'sheet__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '저장·불러오기' },
    h('div', { class: 'sheet__head' }, h('span', {}, '저장·불러오기'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: () => close() }, '✕')),
    list,
    note,
    h('div', { class: 'sheet__settings' }, createTextSizeControl()),
  );
  const el = h('div', { class: 'sheet', hidden: true, onclick: (e) => e.target === el && close() }, panel);
  let loadOnly = false; // 타이틀에서 열면 불러오기만

  function close() {
    if (el.hidden) return;
    el.hidden = true;
    onClose?.();
  }

  function row(entry) {
    const info = entry.ok ? describe(entry.save) : REASON_TEXT[entry.reason] ?? '';
    const actions = h('div', { class: 'sheet__actions' });
    const confirm = (question, run) =>
      actions.replaceChildren(
        h('span', { class: 'sheet__ask' }, question),
        h('button', { class: 'sheet__btn sheet__btn--primary', type: 'button', onclick: run }, '예'),
        h('button', { class: 'sheet__btn', type: 'button', onclick: () => render() }, '아니요'),
      );
    const buttons = [];
    if (!entry.auto && !loadOnly) {
      buttons.push(
        h('button', {
          class: 'sheet__btn', type: 'button', disabled: !canSave(),
          onclick: () => (entry.ok ? confirm('덮어쓸까요?', () => { onSave(entry.key); render(); }) : (onSave(entry.key), render())),
        }, '저장'),
      );
    }
    buttons.push(
      h('button', {
        class: 'sheet__btn', type: 'button', disabled: !entry.ok,
        onclick: () => (loadOnly ? onLoad(entry.key) : confirm('지금 진행을 멈추고 불러올까요?', () => onLoad(entry.key))),
      }, '불러오기'),
    );
    actions.replaceChildren(...buttons);
    return h('div', { class: 'sheet__row' }, h('div', { class: 'sheet__label' }, h('strong', {}, entry.label), h('span', {}, info)), actions);
  }

  function render() {
    list.replaceChildren(...getEntries().map(row));
    note.textContent = loadOnly
      ? '저장은 게임 중 상단 ☰ 메뉴에서 할 수 있습니다.'
      : canSave() ? '자동 저장은 장면이 바뀔 때와 선택 직후에 됩니다.' : '지금은 저장할 수 없습니다 (진행이 끝남).';
  }

  return {
    el,
    open({ loadOnly: only = false } = {}) {
      loadOnly = only;
      render();
      el.hidden = false;
      onOpen?.();
      panel.querySelector('button')?.focus();
    },
    close,
  };
}
