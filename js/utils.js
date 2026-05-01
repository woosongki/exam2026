/**
 * 유틸리티 함수
 */

// XSS 방지: HTML 이스케이프
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 정규식 메타 이스케이프
export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 검색어 하이라이트 (XSS 안전)
export function highlight(text, kw) {
  if (!text) return '';
  const safe = escapeHtml(text);
  if (!kw) return safe;
  const re = new RegExp(escapeRegExp(kw), 'gi');
  return safe.replace(re, m => `<mark class="hl">${m}</mark>`);
}

// 로컬 타임존 기준 오늘 (YYYY-MM-DD)
export function todayKey() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

// ISO 8601 주차 키 (YYYY-Www)
export function weekKey(date) {
  const d = date ? new Date(date) : new Date();
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const week = 1 + Math.round(
    ((target - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7
  );
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// 두 날짜 간 일수 차이
export function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / 86400000);
}

// 디바운스
export function debounce(fn, ms = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// 토스트
let toastWrap = null;
export function toast(message, type = 'info', duration = 2700) {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    toastWrap.setAttribute('role', 'status');
    toastWrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastWrap);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  toastWrap.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// 포커스 트랩 (모달 내부에 가두기)
function trapFocus(modalEl) {
  const focusables = modalEl.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return () => {};
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const previouslyFocused = document.activeElement;

  const handler = (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  modalEl.addEventListener('keydown', handler);
  return () => {
    modalEl.removeEventListener('keydown', handler);
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  };
}

// 모달이 열려있는지 확인 (글로벌 단축키 가드용)
export function isModalOpen() {
  return !!document.querySelector('.modal-backdrop');
}

// 모달 (간단 confirm)
export function confirmModal({ title, message, confirmText = '확인', cancelText = '취소', danger = false }) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title || '')}</h3>
        ${message ? `<p>${escapeHtml(message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn btn-sm" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    let releaseTrap = null;
    const close = (val) => {
      if (releaseTrap) releaseTrap();
      back.remove();
      document.removeEventListener('keydown', escHandler);
      resolve(val);
    };
    const escHandler = (e) => { if (e.key === 'Escape') close(false); };
    back.addEventListener('click', e => {
      if (e.target === back) close(false);
      const act = e.target.dataset?.act;
      if (act === 'ok') close(true);
      if (act === 'cancel') close(false);
    });
    document.addEventListener('keydown', escHandler);
    document.body.appendChild(back);
    releaseTrap = trapFocus(back);
    setTimeout(() => back.querySelector('[data-act="ok"]')?.focus(), 50);
  });
}

// 일반 모달 (HTML 콘텐츠) — 도움말 등에서 재사용
export function openModal({ title, html, onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      ${html}
      <div class="modal-actions" style="margin-top:14px">
        <button class="btn btn-sm btn-primary" data-act="close">닫기</button>
      </div>
    </div>`;
  let releaseTrap = null;
  const close = () => {
    if (releaseTrap) releaseTrap();
    back.remove();
    document.removeEventListener('keydown', escHandler);
    if (onClose) onClose();
  };
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', e => {
    if (e.target === back || e.target.dataset?.act === 'close') close();
  });
  document.addEventListener('keydown', escHandler);
  document.body.appendChild(back);
  releaseTrap = trapFocus(back);
  setTimeout(() => back.querySelector('[data-act="close"]')?.focus(), 50);
  return close;
}

// ARIA live region (스크린 리더용)
let liveRegion = null;
export function announce(message) {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = message; }, 50);
}

// 시간 포매터 (mm:ss)
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 시험까지 D-day
// 공인중개사 시험은 매년 10월 마지막 토요일 기준
export function examDday() {
  const now = new Date();
  const year = now.getFullYear();
  // 올해 또는 내년의 10월 마지막 토요일
  const findLastSat = y => {
    const last = new Date(y, 10, 0); // 10월 마지막 날
    const day = last.getDay();
    const diff = (day - 6 + 7) % 7;
    last.setDate(last.getDate() - diff);
    return last;
  };
  let target = findLastSat(year);
  if (target < now) target = findLastSat(year + 1);
  const days = Math.ceil((target - now) / 86400000);
  return { days, date: target };
}

// 문제 풀이 시간 측정 (한 화면당 한 타이머)
let solveStartTs = null;
export function startSolveTimer() {
  solveStartTs = Date.now();
}
export function endSolveTimer() {
  if (!solveStartTs) return null;
  const dur = Date.now() - solveStartTs;
  solveStartTs = null;
  // 1분 이상은 outlier (탭 이동 등) — 무시
  if (dur > 60000 || dur < 100) return null;
  return Math.round(dur / 1000); // 초 단위
}
