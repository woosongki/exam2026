/**
 * 키보드 단축키
 * 1~5: 보기, Enter/N: 다음, P: 이전, B: 북마크, ?: 도움말
 */
import { isModalOpen, openModal } from './utils.js';

const handlers = {
  selectOption: null,
  nextQuestion: null,
  prevQuestion: null,
  toggleBookmark: null,
  showHelp: null,
};

export function setKeyboardHandlers(h) {
  Object.assign(handlers, h);
}

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

document.addEventListener('keydown', (e) => {
  if (isTyping()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // 모달 열려있으면 글로벌 단축키 비활성화 (Enter 충돌 방지)
  if (isModalOpen()) return;

  const k = e.key;
  if (k >= '1' && k <= '5') {
    if (handlers.selectOption) {
      e.preventDefault();
      handlers.selectOption(parseInt(k, 10));
    }
  } else if (k === 'Enter' || k === 'n' || k === 'N') {
    if (handlers.nextQuestion) {
      e.preventDefault();
      handlers.nextQuestion();
    }
  } else if (k === 'p' || k === 'P') {
    if (handlers.prevQuestion) {
      e.preventDefault();
      handlers.prevQuestion();
    }
  } else if (k === 'b' || k === 'B') {
    if (handlers.toggleBookmark) {
      e.preventDefault();
      handlers.toggleBookmark();
    }
  } else if (k === '?') {
    e.preventDefault();
    showHelpModal();
  }
});

export function showHelpModal() {
  const html = `
    <ul class="help-list">
      <li><span>보기 선택</span><span><kbd class="kbd">1</kbd> ~ <kbd class="kbd">5</kbd></span></li>
      <li><span>다음 문제</span><span><kbd class="kbd">Enter</kbd> / <kbd class="kbd">N</kbd></span></li>
      <li><span>이전 문제</span><span><kbd class="kbd">P</kbd></span></li>
      <li><span>북마크 토글</span><span><kbd class="kbd">B</kbd></span></li>
      <li><span>도움말</span><span><kbd class="kbd">?</kbd></span></li>
      <li><span>닫기</span><span><kbd class="kbd">Esc</kbd></span></li>
    </ul>`;
  openModal({ title: '키보드 단축키', html });
}
