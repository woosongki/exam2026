/**
 * 오늘의 문제 탭
 */
import { getState, saveState } from '../storage.js';
import { SUBJS, SUBJ_KEYS, recordAnswer, addToWrongNotes, toggleBookmark, isBookmarked, removeWrongNote } from '../state.js';
import { todayKey, escapeHtml, toast, startSolveTimer, endSolveTimer, announce } from '../utils.js';
import { renderQCard } from './card.js';
import { setKeyboardHandlers } from '../keyboard.js';
import { dueByTomorrow } from '../srs.js';
import { queryArchive, queryBySubject, topicsOf } from '../db.js';

function dbRandom(opts) {
  const pool = queryArchive(opts);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

const dailyCache = {};

function pickRecommended(subject) {
  const S = getState();
  const today = todayKey();
  const usedToday = (S.todayAnswers[today]?.[subject] || []).map(a => a.qid);
  const wrongIds = new Set(S.wrongNotes.filter(n => n.subject === subject).map(n => n.id));
  const usedSet = new Set(usedToday);
  const subjectPool = queryBySubject(subject);

  // 1순위: 오답 중 안 푼 것
  let pool = subjectPool.filter(q => wrongIds.has(q.id) && !usedSet.has(q.id));
  // 2순위: 미풀이 문제
  if (!pool.length) {
    const solved = new Set([...Object.keys(S.archiveHistory), ...usedToday]);
    pool = subjectPool.filter(q => !solved.has(q.id));
  }
  // 3순위: 전체 랜덤
  if (!pool.length) pool = subjectPool;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function renderDaily() {
  const S = getState();
  const el = document.getElementById('page-daily');
  if (!el) return;

  const today = todayKey();
  const todayData = S.todayAnswers[today] || {};
  const dueTomorrow = dueByTomorrow(S.wrongNotes);

  // S1 기준 단원 목록 (현재 과목 기준)
  const topics = topicsOf(S.subject);

  el.innerHTML = `
    ${dueTomorrow > 0 ? `<div style="background:var(--amberL);border:1px solid var(--amber);border-radius:var(--r);padding:10px 14px;margin-top:14px;font-size:13px;color:var(--amber)">
      🔴 내일까지 복습할 오답 <strong>${dueTomorrow}개</strong> — <button class="btn btn-sm" style="margin-left:8px;padding:3px 10px;font-size:12px" data-action="goto-wrong">바로 보기</button>
    </div>` : ''}

    <div class="subj-grid" role="tablist" aria-label="과목 선택">
      ${SUBJ_KEYS.map(s => `
        <button class="sj${S.subject === s ? ' on' : ''}"
                data-action="switch-subject" data-s="${s}"
                role="tab" aria-selected="${S.subject === s}">
          <div class="sn">${escapeHtml(SUBJS[s].name)}</div>
          <div class="ss">${escapeHtml(SUBJS[s].sub)}</div>
        </button>`).join('')}
    </div>
    <div class="mode-row" role="tablist" aria-label="출제 모드">
      <button class="mdbtn${S.mode === 'ai' ? ' on' : ''}" data-action="switch-mode" data-m="ai" role="tab">맞춤 추천</button>
      <button class="mdbtn${S.mode === 'archive' ? ' on' : ''}" data-action="switch-mode" data-m="archive" role="tab">기출 DB</button>
    </div>
    <div class="filter-panel${S.mode === 'archive' ? ' show' : ''}" id="filter-panel">
      <div class="filter-row">
        <span class="fl">회차</span>
        <select class="fsel" data-action="filter-exam" aria-label="회차 필터">
          <option value="">전체</option>
          ${[33, 34, 35, 36].map(e => `<option value="${e}"${S.filter.exam === e ? ' selected' : ''}>${e}회 (${1989 + e}년)</option>`).join('')}
        </select>
        <span class="fl">단원</span>
        <select class="fsel" data-action="filter-topic" aria-label="단원 필터">
          <option value="">전체 단원</option>
          ${topics.map(t => `<option value="${escapeHtml(t)}"${S.filter.topic === t ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <label class="cb-row">
        <input type="checkbox" data-action="filter-unseen" ${S.filter.unseenOnly ? 'checked' : ''}>
        미풀이 문제만 보기
      </label>
    </div>
    <div class="prog-card">
      <div class="prog-row">
        <span class="prog-title">오늘 진도</span>
        <span class="prog-count" id="prog-count">${countTodayDone(todayData)}문제 풀이</span>
      </div>
      <div class="prog-dots">
        ${SUBJ_KEYS.map(s => {
          const arr = todayData[s] || [];
          const has = arr.length > 0;
          const correctCnt = arr.filter(a => a.correct).length;
          const ratio = has ? Math.min(1, arr.length / 10) : 0; // 10문제 = 100%
          let cls = 'prog-mini';
          if (S.subject === s) cls += ' cur';
          let fillCls = '';
          if (has) {
            const accuracy = correctCnt / arr.length;
            fillCls = accuracy >= 0.7 ? 'ok' : accuracy >= 0.4 ? '' : 'fail';
          }
          return `<button class="${cls}" data-action="switch-subject" data-s="${s}" aria-label="${SUBJS[s].name} ${has ? `${arr.length}문제, ${correctCnt}정답` : '미시작'}">
            <span class="prog-mini-lbl">${escapeHtml(SUBJS[s].name.split('·')[0])}</span>
            <div class="prog-mini-bar"><div class="prog-mini-fill ${fillCls}" style="width:${Math.round(ratio * 100)}%"></div></div>
            <span class="prog-mini-cnt">${has ? `${correctCnt}/${arr.length}` : '—'}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
    <div id="quiz-area" aria-live="polite"></div>`;

  setKeyboardHandlers({
    selectOption: (n) => handleSelect(n),
    nextQuestion: () => handleNext(),
    toggleBookmark: () => handleBookmark(),
  });

  renderQuizArea();
}

function countTodayDone(todayData) {
  return Object.values(todayData).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
}

function renderQuizArea() {
  const S = getState();
  const area = document.getElementById('quiz-area');
  if (!area) return;
  const s = S.subject;

  if (S.mode === 'ai') {
    if (!dailyCache[s] || dailyCache[s].mode !== 'ai') {
      area.innerHTML = `<div class="loading"><div class="spinner"></div><p>${escapeHtml(SUBJS[s].name)} 맞춤 문제를 선별 중입니다...</p></div>`;
      setTimeout(() => {
        const q = pickRecommended(s);
        if (!q) {
          area.innerHTML = `<div class="empty"><div class="empty-icon">📭</div>출제 가능한 문제가 없습니다.</div>`;
          return;
        }
        dailyCache[s] = { q, ans: null, mode: 'ai' };
        area.innerHTML = renderQCard(q, null, { mode: 'ai' });
        startSolveTimer();
      }, 200);
      return;
    }
    const { q, ans } = dailyCache[s];
    area.innerHTML = renderQCard(q, ans, { mode: 'ai' });
    if (!ans) startSolveTimer();
    return;
  }

  if (!dailyCache[s] || dailyCache[s].mode !== 'archive' ||
      dailyCache[s].filterKey !== filterKey()) {
    const excludeIds = S.filter.unseenOnly ? Object.keys(S.archiveHistory) : [];
    const q = dbRandom({
      exam: S.filter.exam,
      subject: s,
      topic: S.filter.topic,
      excludeIds,
    });
    if (!q) {
      area.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div>선택한 조건에 해당하는 문제가 없습니다.<br><br>
        <button class="btn btn-primary" data-action="reset-filter">필터 초기화</button></div>`;
      return;
    }
    const histAns = S.archiveHistory[q.id];
    dailyCache[s] = { q, ans: histAns ? { ...histAns, q } : null, mode: 'archive', filterKey: filterKey() };
  }
  const { q, ans } = dailyCache[s];
  area.innerHTML = renderQCard(q, ans, { mode: 'archive' });
  if (!ans) startSolveTimer();
}

function filterKey() {
  const S = getState();
  return `${S.filter.exam}|${S.filter.topic}|${S.filter.unseenOnly}`;
}

export function handleSelect(idx) {
  const S = getState();
  const cache = dailyCache[S.subject];
  if (!cache || !cache.q) return;
  if (cache.ans?.selected != null) return;
  if (idx < 1 || idx > cache.q.options.length) return;

  const correct = idx === cache.q.answer;
  const solveSec = endSolveTimer();
  const ans = recordAnswer({ qid: cache.q.id, q: cache.q, selected: idx, correct, source: cache.mode, solveSec });
  cache.ans = { ...ans, q: cache.q };

  const area = document.getElementById('quiz-area');
  if (area) area.innerHTML = renderQCard(cache.q, cache.ans, { mode: cache.mode });

  const today = todayKey();
  const todayData = S.todayAnswers[today] || {};
  const count = document.getElementById('prog-count');
  if (count) count.textContent = `${countTodayDone(todayData)}문제 풀이`;
  refreshProgDots(todayData);

  showStickyActions(cache);

  // 결과 announcement (스크린 리더)
  announce(correct ? '정답입니다' : '오답입니다');

  if (!correct) toast('오답노트에 자동 추가됐어요', 'info', 1800);
}

function refreshProgDots(todayData) {
  const S = getState();
  document.querySelectorAll('.prog-mini').forEach(btn => {
    const s = btn.dataset.s;
    if (!s) return;
    const arr = todayData[s] || [];
    const has = arr.length > 0;
    const correctCnt = arr.filter(a => a.correct).length;
    const ratio = has ? Math.min(1, arr.length / 10) : 0;
    btn.classList.remove('cur');
    if (S.subject === s) btn.classList.add('cur');
    const fill = btn.querySelector('.prog-mini-fill');
    if (fill) {
      fill.style.width = `${Math.round(ratio * 100)}%`;
      fill.classList.remove('ok', 'fail');
      if (has) {
        const accuracy = correctCnt / arr.length;
        if (accuracy >= 0.7) fill.classList.add('ok');
        else if (accuracy < 0.4) fill.classList.add('fail');
      }
    }
    const cnt = btn.querySelector('.prog-mini-cnt');
    if (cnt) cnt.textContent = has ? `${correctCnt}/${arr.length}` : '—';
  });
}

function showStickyActions(cache) {
  const area = document.getElementById('quiz-area');
  if (!area || !cache.ans) return;
  const S = getState();
  const idx = SUBJ_KEYS.indexOf(S.subject);
  const isLastSubject = idx === SUBJ_KEYS.length - 1;
  const nextSubjBtn = !isLastSubject
    ? `<button class="btn btn-primary" data-action="next-subject">다음 과목 (${escapeHtml(SUBJS[SUBJ_KEYS[idx+1]].name.split('·')[0])}) →</button>`
    : `<button class="btn btn-primary" data-action="goto-stats">📊 결과 보기</button>`;

  const sticky = document.createElement('div');
  sticky.className = 'cta-sticky';
  sticky.innerHTML = `
    <button class="btn" data-action="new-question">🔄 새 문제</button>
    ${nextSubjBtn}`;
  area.appendChild(sticky);
}

export function handleNext() {
  const S = getState();
  const cache = dailyCache[S.subject];
  if (!cache) return;
  if (cache.ans?.selected != null) {
    const idx = SUBJ_KEYS.indexOf(S.subject);
    if (idx < SUBJ_KEYS.length - 1) {
      switchSubject(SUBJ_KEYS[idx + 1]);
    } else {
      newQuestion();
    }
  } else {
    newQuestion();
  }
}

export function handleBookmark() {
  const S = getState();
  const cache = dailyCache[S.subject];
  if (!cache?.q) return;
  const added = toggleBookmark(cache.q.id);
  toast(added ? '⭐ 북마크에 추가됐어요' : '북마크에서 제거됐어요', 'info', 1500);
  const area = document.getElementById('quiz-area');
  if (area) {
    const html = renderQCard(cache.q, cache.ans, { mode: cache.mode });
    area.innerHTML = html;
    if (cache.ans) showStickyActions(cache);
  }
}

export function switchSubject(s) {
  const S = getState();
  S.subject = s;
  saveState();
  renderDaily();
}

export function switchMode(m) {
  const S = getState();
  S.mode = m;
  saveState();
  Object.keys(dailyCache).forEach(k => delete dailyCache[k]);
  renderDaily();
}

export function applyFilter({ exam, topic, unseenOnly }) {
  const S = getState();
  if (exam !== undefined) S.filter.exam = exam ? parseInt(exam, 10) : null;
  if (topic !== undefined) S.filter.topic = topic || null;
  if (unseenOnly !== undefined) S.filter.unseenOnly = unseenOnly;
  saveState();
  Object.keys(dailyCache).forEach(k => delete dailyCache[k]);
  renderQuizArea();
}

export function resetFilter() {
  const S = getState();
  S.filter = { exam: null, topic: null, unseenOnly: false };
  saveState();
  Object.keys(dailyCache).forEach(k => delete dailyCache[k]);
  renderDaily();
}

export function newQuestion() {
  const S = getState();
  delete dailyCache[S.subject];
  renderQuizArea();
}

export function nextSubject() {
  const S = getState();
  const idx = SUBJ_KEYS.indexOf(S.subject);
  if (idx < SUBJ_KEYS.length - 1) switchSubject(SUBJ_KEYS[idx + 1]);
}
