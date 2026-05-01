/**
 * 오답노트 탭
 * - SRS 기반 복습 일정 표시
 * - "지금 복습할 문제" 섹션 (due 항목)
 * - 문제 다시 풀기 (interactive)
 * - 검색·필터
 */
import { getState } from '../storage.js';
import { SUBJS, removeWrongNote, recordAnswer } from '../state.js';
import { escapeHtml, toast, confirmModal } from '../utils.js';
import { isDue, srsLabel, sortByDue, timeUntilDue } from '../srs.js';
import { renderQCard } from './card.js';

const wrongState = {
  filter: 'all', // all | due | subject
  subjectFilter: null,
  reviewing: null, // { qid, ans }
};

export function renderWrong() {
  const S = getState();
  const el = document.getElementById('page-wrong');
  if (!el) return;

  if (!S.wrongNotes.length) {
    el.innerHTML = `<div class="empty" style="margin-top:30px">
      <div class="empty-icon">📓</div>
      오답노트가 비어있습니다.<br>
      <span style="font-size:13px">문제를 틀리면 자동으로 추가됩니다.</span>
    </div>`;
    return;
  }

  // 진행 중인 복습이 있으면 카드 표시
  if (wrongState.reviewing) {
    const note = S.wrongNotes.find(n => n.id === wrongState.reviewing.qid);
    if (note) {
      el.innerHTML = renderReviewCard(note);
      return;
    }
    wrongState.reviewing = null;
  }

  const sorted = sortByDue(S.wrongNotes);
  const dueList = sorted.filter(n => isDue(n.srs));
  const upcoming = sorted.filter(n => !isDue(n.srs));

  let filtered = sorted;
  if (wrongState.filter === 'due') filtered = dueList;
  if (wrongState.filter === 'subject' && wrongState.subjectFilter) {
    filtered = sorted.filter(n => n.subject === wrongState.subjectFilter);
  }

  el.innerHTML = `
    <div style="margin-top:18px">
      <div class="exam-hero" style="margin-bottom:14px;padding:16px">
        <h2 style="font-size:16px;margin-bottom:4px">📓 오답 복습</h2>
        <p style="font-size:13px">총 ${S.wrongNotes.length}개 · 오늘 복습 ${dueList.length}개 · 학습 후 다시 출제하면 일정이 늘어납니다.</p>
      </div>

      <div class="filter-row" style="gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <button class="filter-chip${wrongState.filter === 'all' ? ' active' : ''}" data-action="wrong-filter" data-f="all">
          전체 (${S.wrongNotes.length})
        </button>
        <button class="filter-chip${wrongState.filter === 'due' ? ' active' : ''}" data-action="wrong-filter" data-f="due">
          ${dueList.length > 0 ? `🔴 오늘 복습 (${dueList.length})` : `오늘 복습 (0)`}
        </button>
        ${Object.entries(SUBJS).map(([k, v]) => {
          const cnt = S.wrongNotes.filter(n => n.subject === k).length;
          if (cnt === 0) return '';
          const active = wrongState.filter === 'subject' && wrongState.subjectFilter === k;
          return `<button class="filter-chip${active ? ' active' : ''}" data-action="wrong-filter" data-f="subject" data-s="${k}">
            ${escapeHtml(v.name.split('·')[0])} (${cnt})
          </button>`;
        }).join('')}
      </div>

      ${filtered.length === 0 ? `
        <div class="empty"><div class="empty-icon">✅</div>해당 항목이 없습니다.</div>
      ` : filtered.map((n, i) => renderNoteItem(n, i)).join('')}
    </div>`;
}

function renderNoteItem(n, idx) {
  const due = isDue(n.srs);
  const dueLabel = due
    ? '🔴 복습 가능'
    : `${Math.ceil(timeUntilDue(n.srs) / 86400000)}일 후`;

  return `<div class="wn-item">
    <div class="wn-hdr">
      <div style="flex:1">
        <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;align-items:center">
          <span class="badge badge-db">${escapeHtml(SUBJS[n.subject]?.name || n.subject)}</span>
          ${n.topic ? `<span class="topic-tag">${escapeHtml(n.topic)}</span>` : ''}
          ${n.exam ? `<span class="badge badge-no">제${n.exam}회 ${n.id?.match(/-(\d+)$/)?.[1] || ''}번</span>` : ''}
          <span class="wn-srs ${due ? 'due' : ''}">${dueLabel}</span>
          <span class="wn-srs">${escapeHtml(srsLabel(n.srs))}</span>
        </div>
        <div class="wn-q">${escapeHtml(n.question)}</div>
      </div>
    </div>
    <div class="wn-detail">
      <strong>해설:</strong> ${escapeHtml(n.explanation || '')}
      ${n.keyPoints && n.keyPoints.length ? `<br><br><strong>핵심:</strong> ${n.keyPoints.map(k => escapeHtml(k)).join(' · ')}` : ''}
    </div>
    <div class="act-row" style="margin-top:10px">
      <button class="btn btn-sm btn-primary" data-action="wrong-review" data-qid="${escapeHtml(n.id)}">
        🔄 다시 풀기
      </button>
      <button class="btn btn-sm btn-danger" data-action="wrong-delete" data-i="${idx}" data-qid="${escapeHtml(n.id)}">
        삭제
      </button>
    </div>
  </div>`;
}

function renderReviewCard(note) {
  const ans = wrongState.reviewing.ans;
  // 임시 q 객체
  const q = {
    id: note.id,
    question: note.question,
    options: note.options || [],
    answer: note.answer,
    explanation: note.explanation,
    keyPoints: note.keyPoints,
    subject: note.subject,
    topic: note.topic,
    exam: note.exam,
  };
  return `
    <div style="margin-top:18px">
      <button class="btn btn-sm" data-action="wrong-back" style="margin-bottom:14px">← 목록으로</button>
      ${renderQCard(q, ans, { mode: 'archive' })}
      ${ans ? `<div class="cta-sticky">
        <button class="btn" data-action="wrong-back">목록으로</button>
        <button class="btn btn-primary" data-action="wrong-back">${ans.correct ? '✓ 복습 완료' : '다시 학습'}</button>
      </div>` : ''}
    </div>`;
}

export function wrongFilter(f, s) {
  wrongState.filter = f;
  wrongState.subjectFilter = s || null;
  renderWrong();
}

export function wrongDelete(i, qid) {
  const idx = parseInt(i, 10);
  const S = getState();
  if (S.wrongNotes[idx]?.id === qid) {
    removeWrongNote(qid);
    toast('오답노트에서 삭제됐어요', 'info', 1500);
    renderWrong();
  }
}

export function wrongReview(qid) {
  if (!qid) return;
  // options와 answer가 노트에 저장되어 있어야 함
  const S = getState();
  const note = S.wrongNotes.find(n => n.id === qid);
  if (!note || !note.options || !note.answer) {
    toast('이 문제는 다시 풀 수 없습니다 (구버전 데이터).', 'error');
    return;
  }
  wrongState.reviewing = { qid, ans: null };
  renderWrong();
}

export function wrongBack() {
  wrongState.reviewing = null;
  renderWrong();
}

// 복습 카드 내에서 답 선택
export function wrongSelectOption(idx) {
  const S = getState();
  if (!wrongState.reviewing) return;
  const note = S.wrongNotes.find(n => n.id === wrongState.reviewing.qid);
  if (!note) return;
  if (wrongState.reviewing.ans?.selected != null) return;

  const correct = idx === note.answer;
  const q = {
    id: note.id, question: note.question, options: note.options,
    answer: note.answer, subject: note.subject, topic: note.topic,
    explanation: note.explanation, keyPoints: note.keyPoints, exam: note.exam,
  };
  recordAnswer({ qid: q.id, q, selected: idx, correct, source: 'review' });
  wrongState.reviewing.ans = { selected: idx, correct, ts: Date.now() };
  renderWrong();
}
