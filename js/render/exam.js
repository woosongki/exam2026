/**
 * 모의고사 탭 — 세션 자동 저장 + 복구
 */
import { getState, saveState } from '../storage.js';
import { SUBJS, saveExamResult, addToWrongNotes, saveExamSession, loadExamSession, clearExamSession } from '../state.js';
import { escapeHtml, formatTime, toast, confirmModal, openModal, announce } from '../utils.js';
import { buildQuestionTextHtml } from './card.js';
import { setKeyboardHandlers } from '../keyboard.js';
import { queryByExam } from '../db.js';

let session = null;

const EXAM_SETS = {
  '1교시': { subjects: ['S1', 'S2'], minutes: 100, label: '1교시 (중개사법·실무 + 부동산공법)' },
  '2교시': { subjects: ['S3', 'S4'], minutes: 50, label: '2교시 (공시법령 + 세법)' },
};

// 앱 시작 시 진행 중이던 시험 복구 시도
export async function tryResumeExam() {
  const saved = loadExamSession();
  if (!saved || saved.finished) return;
  // 5분 이상 지난 세션은 만료
  const elapsed = (Date.now() - (saved.savedAt || saved.startedAt)) / 1000;
  if (elapsed > saved.durationSec) {
    clearExamSession();
    return;
  }
  const ok = await confirmModal({
    title: '진행 중인 시험이 있어요',
    message: `${saved.exam}회 ${saved.set} 시험을 이어서 푸시겠어요? (남은 시간 자동 차감)`,
    confirmText: '이어 풀기',
    cancelText: '새로 시작',
  });
  if (ok) {
    session = saved;
    session.active = true;
    // 흐른 시간 차감
    const elapsedSec = Math.floor(elapsed);
    session.remainSec = Math.max(0, saved.remainSec - elapsedSec);
    session.flagged = new Set(saved.flagged || []);
    startTimer();
    return true;
  } else {
    clearExamSession();
  }
  return false;
}

export function renderExam() {
  const el = document.getElementById('page-exam');
  if (!el) return;

  if (session && session.active) {
    renderExamSession();
    return;
  }
  if (session && session.finished) {
    renderExamResult();
    return;
  }
  renderExamLanding();
}

function renderExamLanding() {
  const el = document.getElementById('page-exam');
  const exams = [33, 34, 35, 36];
  const S = getState();
  const recentResults = S.examResults.slice(0, 5);

  el.innerHTML = `
    <div class="exam-hero" style="margin-top:18px">
      <h2>실전 모의고사</h2>
      <p>실제 시험과 동일한 형식·시간으로 풀이합니다. 1교시(80문항·100분) 또는 2교시(40문항·50분)를 선택하세요.</p>
    </div>

    <h3 style="font-size:14px;color:var(--text2);margin:20px 0 10px;font-weight:600">회차 선택</h3>
    <div class="exam-list">
      ${exams.map(e => {
        const examQuestions = queryByExam(e);
        return `<div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:12px;color:var(--text-meta);padding-left:4px">제${e}회 (${1989 + e}년)</div>
          ${Object.entries(EXAM_SETS).map(([key, set]) => {
            const total = examQuestions.filter(q => set.subjects.includes(q.subject)).length;
            return `<button class="exam-item" data-action="start-exam" data-exam="${e}" data-set="${key}">
              <div class="exam-item-info">
                <div class="exam-item-title">${e}회 ${escapeHtml(key)}</div>
                <div class="exam-item-sub">${escapeHtml(set.label)} · ${total}문항 · ${set.minutes}분</div>
              </div>
              <div class="exam-item-arrow">→</div>
            </button>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>

    ${recentResults.length ? `
      <h3 style="font-size:14px;color:var(--text2);margin:24px 0 10px;font-weight:600">최근 응시 기록</h3>
      <div class="exam-list">
        ${recentResults.map(r => {
          const pct = Math.round(r.score / r.total * 100);
          const passLevel = pct >= 60;
          const date = new Date(r.ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
          return `<div class="exam-item" style="cursor:default">
            <div class="exam-item-info">
              <div class="exam-item-title">${r.exam}회 ${escapeHtml(r.set || '')}</div>
              <div class="exam-item-sub">${date} · ${r.score}/${r.total}문항 · ${formatTime(r.durationSec)}</div>
            </div>
            <div style="font-size:24px;font-weight:700;color:${passLevel ? 'var(--green)' : 'var(--red)'};font-variant-numeric:tabular-nums;letter-spacing:-0.02em">${pct}%</div>
          </div>`;
        }).join('')}
      </div>` : ''}`;
}

export function startExam(exam, setKey) {
  const set = EXAM_SETS[setKey];
  if (!set) return;
  const examQuestions = queryByExam(parseInt(exam, 10));
  const questions = examQuestions
    .filter(q => set.subjects.includes(q.subject))
    .sort((a, b) => a.subject !== b.subject
      ? set.subjects.indexOf(a.subject) - set.subjects.indexOf(b.subject)
      : a.no - b.no);

  if (!questions.length) {
    toast('해당 회차의 문제가 없습니다.', 'error');
    return;
  }

  session = {
    active: true,
    finished: false,
    exam: parseInt(exam, 10),
    set: setKey,
    setLabel: set.label,
    questions,
    answers: new Array(questions.length).fill(null),
    flagged: new Set(),
    cursor: 0,
    startedAt: Date.now(),
    durationSec: set.minutes * 60,
    remainSec: set.minutes * 60,
  };
  persistSession();
  startTimer();
  renderExam();
}

let timerHandle = null;
let persistHandle = null;
function startTimer() {
  if (timerHandle) clearInterval(timerHandle);
  if (persistHandle) clearInterval(persistHandle);
  timerHandle = setInterval(() => {
    if (!session?.active) {
      clearInterval(timerHandle);
      return;
    }
    session.remainSec--;
    updateTimerDisplay();
    if (session.remainSec <= 0) {
      finishExam(true);
    }
  }, 1000);
  // 5초마다 sessionStorage 저장
  persistHandle = setInterval(() => {
    if (session?.active) persistSession();
  }, 5000);
}

function persistSession() {
  if (!session) return;
  saveExamSession({
    ...session,
    flagged: [...session.flagged],
    savedAt: Date.now(),
  });
}

function updateTimerDisplay() {
  const tEl = document.getElementById('exam-time');
  if (!tEl) return;
  tEl.textContent = formatTime(session.remainSec);
  tEl.classList.remove('warn', 'danger');
  if (session.remainSec <= 60) tEl.classList.add('danger');
  else if (session.remainSec <= 300) tEl.classList.add('warn');
}

function renderExamSession() {
  const el = document.getElementById('page-exam');
  const q = session.questions[session.cursor];
  const ans = session.answers[session.cursor];

  el.innerHTML = `
    <div class="exam-timer">
      <div class="exam-timer-left">
        <span id="exam-time" class="exam-time">${formatTime(session.remainSec)}</span>
        <span class="exam-progress-text">${session.cursor + 1} / ${session.questions.length}</span>
      </div>
      <button class="btn btn-sm btn-danger" data-action="exam-give-up">제출</button>
    </div>

    <div class="qcard">
      <div class="qmeta">
        <span class="badge badge-db">${session.exam}회 ${escapeHtml(session.set)}</span>
        <span class="badge badge-no">${q.no}번</span>
        <span class="topic-tag">${escapeHtml(SUBJS[q.subject].name)}</span>
        <button class="btn btn-sm" data-action="exam-flag" style="margin-left:auto">
          ${session.flagged.has(session.cursor) ? '🏷 표시됨' : '🏷 표시'}
        </button>
      </div>
      ${buildQuestionTextHtml(q)}
      <div class="opts" role="radiogroup" aria-label="보기">
        ${q.options.map((o, i) => {
          const num = i + 1;
          const selected = ans === num;
          return `<button class="opt${selected ? ' correct' : ''}" data-action="exam-answer" data-idx="${num}" aria-checked="${selected}">
            <span class="opt-num">${num}</span>
            <span class="opt-text">${escapeHtml(o)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="act-row" style="justify-content:space-between;margin-top:14px">
      <button class="btn btn-sm" data-action="exam-prev" ${session.cursor === 0 ? 'disabled' : ''}>← 이전</button>
      <button class="btn btn-sm btn-primary" data-action="exam-next">
        ${session.cursor === session.questions.length - 1 ? '제출하기' : '다음 →'}
      </button>
    </div>

    <div class="exam-nav" aria-label="문제 네비게이션">
      ${session.questions.map((_, i) => {
        let cls = 'exam-nav-btn';
        if (i === session.cursor) cls += ' cur';
        else if (session.answers[i] != null) cls += ' answered';
        return `<button class="${cls}" data-action="exam-jump" data-i="${i}" aria-label="${i + 1}번 문제로 이동">${i + 1}</button>`;
      }).join('')}
    </div>`;

  setKeyboardHandlers({
    selectOption: (n) => examAnswer(n),
    nextQuestion: () => examNext(),
    prevQuestion: () => examPrev(),
    toggleBookmark: () => examFlag(),
  });
}

export function examAnswer(idx) {
  if (!session?.active) return;
  const q = session.questions[session.cursor];
  if (idx < 1 || idx > q.options.length) return;
  session.answers[session.cursor] = idx;
  persistSession();
  if (session.cursor < session.questions.length - 1) {
    session.cursor++;
  }
  renderExamSession();
}

export function examNext() {
  if (!session?.active) return;
  if (session.cursor < session.questions.length - 1) {
    session.cursor++;
    renderExamSession();
  } else {
    submitExam();
  }
}

export function examPrev() {
  if (!session?.active) return;
  if (session.cursor > 0) {
    session.cursor--;
    renderExamSession();
  }
}

export function examJump(i) {
  if (!session?.active) return;
  session.cursor = parseInt(i, 10);
  renderExamSession();
}

export function examFlag() {
  if (!session?.active) return;
  if (session.flagged.has(session.cursor)) session.flagged.delete(session.cursor);
  else session.flagged.add(session.cursor);
  persistSession();
  renderExamSession();
}

export async function submitExam() {
  if (!session?.active) return;
  const unanswered = session.answers.filter(a => a == null).length;
  if (unanswered > 0) {
    const ok = await confirmModal({
      title: '시험 제출',
      message: `미응답 문제가 ${unanswered}개 있습니다. 그래도 제출하시겠어요?`,
      confirmText: '제출',
      cancelText: '계속 풀기',
    });
    if (!ok) return;
  }
  finishExam(false);
}

function finishExam(timeUp) {
  if (!session) return;
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  if (persistHandle) { clearInterval(persistHandle); persistHandle = null; }
  session.active = false;
  session.finished = true;
  session.endedAt = Date.now();

  let correct = 0;
  const detailedAnswers = session.questions.map((q, i) => {
    const sel = session.answers[i];
    const isCorrect = sel === q.answer;
    if (isCorrect) correct++;
    return { qid: q.id, selected: sel, correct: isCorrect, answer: q.answer, subject: q.subject };
  });

  session.score = correct;
  session.total = session.questions.length;
  session.detailedAnswers = detailedAnswers;
  session.timeUp = timeUp;

  saveExamResult({
    exam: session.exam,
    set: session.set,
    setLabel: session.setLabel,
    score: correct,
    total: session.questions.length,
    ts: session.endedAt,
    durationSec: Math.round((session.endedAt - session.startedAt) / 1000),
    answers: detailedAnswers,
  });
  clearExamSession();

  if (timeUp) toast('시간이 종료됐습니다.', 'info', 2000);
  announce(`시험 종료, ${session.score}점 만점에 ${correct}점`);
  renderExam();
}

function renderExamResult() {
  const el = document.getElementById('page-exam');
  const pct = Math.round(session.score / session.total * 100);
  const passed = pct >= 60;

  const bySubject = {};
  session.detailedAnswers.forEach(a => {
    if (!bySubject[a.subject]) bySubject[a.subject] = { total: 0, correct: 0 };
    bySubject[a.subject].total++;
    if (a.correct) bySubject[a.subject].correct++;
  });

  el.innerHTML = `
    <div class="exam-result-card" style="margin-top:18px">
      <div class="exam-result-score ${passed ? 'exam-result-pass' : 'exam-result-fail'}">
        ${pct}<sup>%</sup>
      </div>
      <div style="font-size:14px;color:var(--text2);margin:6px 0">${session.score} / ${session.total} 정답</div>
      <div class="exam-result-msg">${passed ? '🎉 합격 기준(60%) 달성!' : `합격선까지 ${Math.ceil((0.6 - session.score / session.total) * session.total)}문제 더`}</div>
    </div>

    <h3 style="font-size:14px;color:var(--text2);margin:0 0 10px;font-weight:600">과목별 점수</h3>
    ${Object.entries(bySubject).map(([s, d]) => {
      const p = Math.round(d.correct / d.total * 100);
      return `<div class="bar-row">
        <span class="bar-lbl">${escapeHtml(SUBJS[s].name.split('·')[0])}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${p >= 60 ? 'var(--green)' : 'var(--red)'}"></div></div>
        <span class="bar-pct">${d.correct}/${d.total}</span>
      </div>`;
    }).join('')}

    <h3 style="font-size:14px;color:var(--text2);margin:20px 0 10px;font-weight:600">오답 다시 보기</h3>
    <div class="exam-list">
      ${session.detailedAnswers.filter(a => !a.correct).map((a) => {
        const q = session.questions.find(qu => qu.id === a.qid);
        return `<div class="exam-item" style="cursor:default;flex-direction:column;align-items:flex-start;gap:8px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge badge-db">${q.no}번</span>
            <span class="topic-tag">${escapeHtml(q.topic || '')}</span>
            <span class="badge badge-result-fail">✗ 오답</span>
          </div>
          <div style="font-size:14px;color:var(--text);line-height:1.6">${escapeHtml(q.question.split('\n')[0])}</div>
          <div style="font-size:13px;color:var(--text-meta)">선택: ${a.selected || '미응답'} · 정답: ${a.answer}</div>
        </div>`;
      }).join('') || '<div class="empty">전부 정답입니다! 🎉</div>'}
    </div>

    <div class="cta-sticky">
      <button class="btn" data-action="exam-restart">새 시험 시작</button>
      <button class="btn btn-primary" data-action="exam-review-wrong">오답을 노트에 저장</button>
    </div>`;
}

export function examRestart() {
  session = null;
  renderExam();
}

export function examReviewWrong() {
  if (!session?.detailedAnswers) return;
  let added = 0;
  session.detailedAnswers
    .filter(a => !a.correct && a.selected != null)
    .forEach(a => {
      const q = session.questions.find(qu => qu.id === a.qid);
      if (q) {
        addToWrongNotes(q);
        added++;
      }
    });
  toast(`${added}개 문제를 오답노트에 추가했어요`, 'success', 2000);
}

export async function examGiveUp() {
  const ok = await confirmModal({
    title: '시험 제출',
    message: '지금까지의 답안으로 채점합니다. 이어서 풀 수 없습니다.',
    confirmText: '제출',
    danger: true,
  });
  if (!ok) return;
  finishExam(false);
}
