/**
 * 핵심 암기장 탭
 * - 과목별 카드 그룹
 * - 검색 (XSS 안전)
 * - 펼치기/접기
 */
import { getState, saveState } from '../storage.js';
import { SUBJS } from '../state.js';
import { escapeHtml, highlight, debounce } from '../utils.js';

let MEMO_DATA = {};
export function initMemo(memo) { MEMO_DATA = memo; }

const MEMO_STATE = {
  subject: 'S1',
  search: '',
  openCards: new Set(['all']),
};

export function renderMemo() {
  const el = document.getElementById('page-memo');
  if (!el) return;

  el.innerHTML = `
    <div style="margin-top:18px">
      <div class="memo-subjs" role="tablist" aria-label="암기장 과목 선택">
        ${Object.entries(SUBJS).map(([k, v]) => `
          <button class="memo-subj-btn${MEMO_STATE.subject === k ? ' on' : ''}"
                  data-action="memo-subj" data-s="${k}" role="tab">${escapeHtml(v.name)}</button>`).join('')}
      </div>
      <input class="memo-search" type="text"
             placeholder="수치·키워드 검색"
             value="${escapeHtml(MEMO_STATE.search)}"
             data-action="memo-search"
             aria-label="암기장 검색">
      <div style="font-size:11px;color:var(--text3);margin:-6px 0 12px;padding:0 4px">예: 3개월, 취득세, 1/3 이상</div>
      <div id="memo-cards">${buildMemoCards()}</div>
    </div>`;
}

function buildMemoCards() {
  const data = MEMO_DATA[MEMO_STATE.subject] || [];
  const kw = MEMO_STATE.search.trim();
  const lowKw = kw.toLowerCase();
  let html = '';
  let anyShown = false;

  data.forEach((group, gi) => {
    const rows = kw
      ? group.items.filter(([k, v]) => k.toLowerCase().includes(lowKw) || v.toLowerCase().includes(lowKw))
      : group.items;
    if (!rows.length) return;
    anyShown = true;
    const cardId = `memo-card-${gi}`;
    const isOpen = MEMO_STATE.openCards.has('all') || MEMO_STATE.openCards.has(cardId) || kw.length > 0;
    const valColors = ['', '', 'green', 'amber', 'purple'];

    html += `
      <div class="memo-card">
        <button class="memo-card-hdr" data-action="memo-toggle" data-id="${cardId}" aria-expanded="${isOpen}">
          <span class="${escapeHtml(group.catColor)} memo-cat">${escapeHtml(group.cat)}</span>
          <span style="font-size:12px;color:var(--text3);margin-left:auto">${rows.length}개</span>
          <span class="memo-toggle">${isOpen ? '▲' : '▼'}</span>
        </button>
        <div class="memo-body${isOpen ? ' open' : ''}" id="${cardId}">
          ${rows.map(([k, v], ri) => `
            <div class="memo-row">
              <span class="memo-key">${highlight(k, kw)}</span>
              <span class="memo-val ${valColors[ri % 5]}">${highlight(v, kw)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  });

  if (!anyShown) {
    html = `<div class="memo-empty">검색 결과가 없습니다.<br><span style="font-size:13px">'${escapeHtml(MEMO_STATE.search)}' 에 해당하는 항목이 없어요.</span></div>`;
  }
  return html;
}

export function memoSetSubj(s) {
  MEMO_STATE.subject = s;
  MEMO_STATE.search = '';
  MEMO_STATE.openCards = new Set(['all']);
  renderMemo();
}

const memoSearchDebounced = debounce((val) => {
  MEMO_STATE.search = val;
  const mc = document.getElementById('memo-cards');
  if (mc) mc.innerHTML = buildMemoCards();
}, 150);

export function memoSearch(val) {
  MEMO_STATE.search = val;
  memoSearchDebounced(val);
}

export function memoToggle(cardId) {
  if (MEMO_STATE.openCards.has(cardId)) {
    MEMO_STATE.openCards.delete(cardId);
  } else {
    MEMO_STATE.openCards.add(cardId);
    MEMO_STATE.openCards.delete('all'); // 명시적 토글로 전환
  }
  const body = document.getElementById(cardId);
  if (body) {
    body.classList.toggle('open');
    const hdr = body.previousElementSibling;
    const arrow = hdr?.querySelector('.memo-toggle');
    if (arrow) arrow.textContent = body.classList.contains('open') ? '▲' : '▼';
    if (hdr) hdr.setAttribute('aria-expanded', body.classList.contains('open'));
  }
}
