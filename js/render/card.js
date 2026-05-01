/**
 * 문제 카드 공통 렌더러
 * - 문제 본문/보기/해설 표시
 * - innerHTML 사용하지만 모든 사용자/DB 콘텐츠는 escapeHtml 거침
 */
import { escapeHtml } from '../utils.js';
import { isBookmarked } from '../state.js';

// 문제 본문 분리: 메인 질문 + ㄱ/ㄴ/ㄷ 리스트
function splitQuestionText(text) {
  if (!text) return { main: '', list: '' };
  // 줄 단위로 분리, "ㄱ.", "ㄴ." 등으로 시작하는 줄을 찾음
  const lines = text.split('\n');
  let listStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[ㄱㄴㄷㄹㅁㅂ]\./.test(lines[i]) || /^\s*○/.test(lines[i])) {
      listStart = i;
      break;
    }
  }
  if (listStart < 0) return { main: text, list: '' };
  return {
    main: lines.slice(0, listStart).join('\n').trim(),
    list: lines.slice(listStart).join('\n').trim(),
  };
}

export function buildBadgeHtml(q, mode = 'archive') {
  if (mode === 'ai') {
    return `<span class="badge badge-ai">✦ 맞춤 추천</span>` +
           `<span class="topic-tag">${escapeHtml(q.topic || '')}</span>`;
  }
  if (mode === 'exam') {
    return `<span class="badge badge-db">제${q.exam}회 모의고사</span>` +
           `<span class="badge badge-no">${q.no}번</span>`;
  }
  return `<span class="badge badge-db">제${q.exam}회 기출</span>` +
         `<span class="badge badge-no">${q.no}번</span>` +
         `<span class="topic-tag">${escapeHtml(q.topic || '')}</span>`;
}

export function buildOptionsHtml(q, ans, { showResult = true, hideExplain = false } = {}) {
  const done = ans && ans.selected != null && showResult;
  return q.options.map((o, i) => {
    let cls = 'opt';
    if (done) {
      if (i === q.answer - 1) cls += ' correct';
      if (ans.selected - 1 === i && !ans.correct) cls += ' wrong';
    }
    const num = i + 1;
    return `<button class="${cls}" ${done ? 'disabled' : ''} data-action="select-option" data-qid="${escapeHtml(q.id)}" data-idx="${num}" aria-label="보기 ${num}번">
      <span class="opt-num" aria-hidden="true">${num}</span>
      <span class="opt-text">${escapeHtml(o)}</span>
    </button>`;
  }).join('');
}

export function buildExplainHtml(q, ans) {
  if (!ans || ans.selected == null) return '';
  const correctTxt = ans.correct ? '✓ 정답입니다' : '✗ 오답입니다 — 해설';
  let html = `<div class="explain" role="region" aria-label="해설">
    <h4>${correctTxt}</h4>
    <p>${escapeHtml(q.explanation || '해설 준비 중입니다.')}</p>`;
  if (q.keyPoints && q.keyPoints.length) {
    html += `<div class="kpts">
      <h5>핵심 암기 포인트</h5>
      ${q.keyPoints.map(k => `<div class="kpt">${escapeHtml(k)}</div>`).join('')}
    </div>`;
  }
  html += `</div>`;
  return html;
}

export function buildResultBadge(ans) {
  if (!ans || ans.selected == null) return '';
  return ans.correct
    ? `<span class="badge badge-result-ok">✓ 정답</span>`
    : `<span class="badge badge-result-fail">✗ 오답</span>`;
}

export function buildQuestionTextHtml(q) {
  const { main, list } = splitQuestionText(q.question);
  let html = `<div class="qtext">`;
  if (list) {
    html += `<span class="qtext-main">${escapeHtml(main)}</span>`;
    html += `<span class="qtext-list">${escapeHtml(list)}</span>`;
  } else {
    html += escapeHtml(main || q.question);
  }
  html += `</div>`;
  return html;
}

// 통합 카드 렌더 (daily, archive 공통)
export function renderQCard(q, ans, { mode = 'archive', showResult = true } = {}) {
  const done = ans && ans.selected != null && showResult;
  const bookmarked = isBookmarked(q.id);
  return `
    <div class="qcard" role="region" aria-label="문제 카드">
      <div class="qmeta">
        ${buildBadgeHtml(q, mode)}
        ${done ? buildResultBadge(ans) : ''}
        ${bookmarked ? `<span class="badge badge-manual" title="북마크됨">⭐</span>` : ''}
      </div>
      ${buildQuestionTextHtml(q)}
      <div class="opts" role="radiogroup" aria-label="보기">
        ${buildOptionsHtml(q, ans, { showResult })}
      </div>
      ${showResult ? buildExplainHtml(q, ans) : ''}
    </div>`;
}
