/**
 * 기출 DB 탭
 */
import { getState, saveState } from '../storage.js';
import { SUBJS, SUBJ_KEYS, recordAnswer, isBookmarked, toggleBookmark } from '../state.js';
import { escapeHtml, toast, startSolveTimer, endSolveTimer, announce } from '../utils.js';
import { renderQCard } from './card.js';
import { setKeyboardHandlers } from '../keyboard.js';
import { queryArchive, queryByExamSubject, queryBySubject, getDB } from '../db.js';

function getArchivePool() {
  const S = getState();
  const { exam } = S.archFilter;
  const pool = exam != null
    ? queryByExamSubject(exam, S.subject)
    : queryBySubject(S.subject);
  return [...pool].sort((a, b) => a.exam !== b.exam ? a.exam - b.exam : a.no - b.no);
}

export function renderArchive() {
  const S = getState();
  const el = document.getElementById('page-archive');
  if (!el) return;

  const DB = getDB();
  const totalAll = DB.length;
  const doneAll = Object.keys(S.archiveHistory).length;
  const pctAll = totalAll > 0 ? Math.round(doneAll / totalAll * 100) : 0;

  // 매트릭스 — 풀이 비율 기반 (정답률은 통계 탭에서)
  const matrix = {};
  ['S1', 'S2', 'S3', 'S4'].forEach(s => {
    matrix[s] = {};
    [33, 34, 35, 36].forEach(e => {
      const subset = queryByExamSubject(e, s);
      const all = subset.length;
      const done = subset.filter(q => S.archiveHistory[q.id]).length;
      const correctCount = subset.filter(q => S.archiveHistory[q.id]?.correct).length;
      const accuracy = done > 0 ? correctCount / done : 0;
      matrix[s][e] = { all, done, correctCount, accuracy };
    });
  });

  el.innerHTML = `
    <div class="arch-summary" style="margin-top:18px">
      <h3>전체 풀이 진도</h3>
      <div class="arch-prog-wrap">
        <div class="arch-prog-track"><div class="arch-prog-fill" style="width:${pctAll}%"></div></div>
        <div class="arch-pct">${pctAll}%</div>
      </div>
      <div style="font-size:13px;color:var(--text-meta);margin-top:6px">${doneAll} / ${totalAll} 문항 완료</div>
    </div>

    <div class="matrix-wrap">
      <table class="matrix" aria-label="회차·과목별 진도 매트릭스">
        <thead><tr>
          <th>과목</th>
          ${[33, 34, 35, 36].map(e => `<th>${e}회</th>`).join('')}
        </tr></thead>
        <tbody>
          ${['S1', 'S2', 'S3', 'S4'].map(s => `<tr>
            <td style="text-align:left;padding-left:10px;color:var(--text2);font-size:13px">${escapeHtml(SUBJS[s].name.replace('·실무', ''))}</td>
            ${[33, 34, 35, 36].map(e => {
              const { all, done, accuracy } = matrix[s][e];
              if (!all) return '<td class="mc0" style="font-size:11px;color:var(--text3)">—</td>';
              const ratio = done / all;
              const cls = done === 0 ? 'mc0'
                : ratio < 0.4 ? 'mc1'
                : ratio < 0.8 ? 'mc2'
                : 'mc3';
              const accuracyTxt = done > 0 ? `${Math.round(accuracy * 100)}%` : '';
              return `<td class="${cls}" role="button" tabindex="0"
                data-action="jump-archive" data-s="${s}" data-e="${e}"
                aria-label="${SUBJS[s].name} ${e}회로 이동, ${done}/${all} 풀이${done > 0 ? `, 정답률 ${accuracyTxt}` : ''}">
                ${done}/${all}
                ${done > 0 ? `<span class="mc-sub">${accuracyTxt}</span>` : ''}
              </td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="font-size:12px;color:var(--text-meta);margin-top:6px">셀 클릭 시 해당 회차·과목으로 이동</div>
    </div>

    <div style="margin-bottom:14px">
      <div class="subj-grid" style="margin-bottom:12px">
        ${['S1', 'S2', 'S3', 'S4'].map(s => `
          <button class="sj${S.subject === s ? ' on' : ''}" data-action="switch-subject-arch" data-s="${s}">
            <div class="sn">${escapeHtml(SUBJS[s].name)}</div>
            <div class="ss">${escapeHtml(SUBJS[s].sub)}</div>
          </button>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="filter-row" style="gap:8px;align-items:center">
          <span class="fl" style="min-width:40px">회차</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${[{ v: null, l: '전체' }, ...[33, 34, 35, 36].map(e => ({ v: e, l: `${e}회` }))].map(({ v, l }) => `
              <button class="filter-chip${S.archFilter.exam === v ? ' active' : ''}"
                data-action="arch-set-exam" data-v="${v === null ? '' : v}">${escapeHtml(l)}</button>`).join('')}
          </div>
        </div>
        <div class="filter-row" style="gap:8px;align-items:flex-start">
          <span class="fl" style="min-width:40px;margin-top:6px">문제</span>
          <div id="topic-chips" style="display:flex;gap:5px;flex-wrap:wrap">
            ${buildTopicChips()}
          </div>
        </div>
      </div>
    </div>
    <div id="arch-quiz-area" aria-live="polite"></div>`;

  setKeyboardHandlers({
    selectOption: (n) => handleArchSelect(n),
    nextQuestion: () => archMove(1),
    prevQuestion: () => archMove(-1),
    toggleBookmark: () => handleArchBookmark(),
  });

  renderArchiveQuestion();
}

function buildTopicChips() {
  const S = getState();
  const pool = getArchivePool();
  if (!pool.length) return '<span style="font-size:13px;color:var(--text3)">해당 문항 없음</span>';
  const cursor = S.archiveCursor;
  return pool.map((q, i) => {
    const active = i === cursor;
    const hist = S.archiveHistory[q.id];
    let mark = '';
    if (hist) {
      mark = hist.correct
        ? `<span class="chip-mark ok" aria-label="정답"></span>`
        : `<span class="chip-mark fail" aria-label="오답"></span>`;
    }
    // 컴팩트 칩 — 번호만, 단원명은 큰 화면에서만
    return `<button class="filter-chip chip-compact${active ? ' active' : ''}"
      data-action="arch-jump-to" data-i="${i}"
      title="${escapeHtml(q.topic || '')}">
      ${mark}${q.no}<span class="chip-topic"> ${escapeHtml((q.topic || '').slice(0, 6))}</span>
    </button>`;
  }).join('');
}

export function archSelectOption(idx) {
  handleArchSelect(idx);
}

function renderArchiveQuestion() {
  const S = getState();
  const area = document.getElementById('arch-quiz-area');
  if (!area) return;

  const pool = getArchivePool();
  if (!pool.length) {
    area.innerHTML = `<div class="empty"><div class="empty-icon">📭</div>선택한 조건에 해당하는 문제가 없습니다.</div>`;
    return;
  }

  S.archiveCursor = Math.max(0, Math.min(pool.length - 1, S.archiveCursor));
  const q = pool[S.archiveCursor];
  const hist = S.archiveHistory[q.id];
  const ans = hist ? { ...hist, q } : null;

  const total = pool.length;
  const cursor = S.archiveCursor;
  const poolDone = pool.filter(p => S.archiveHistory[p.id]).length;
  const poolPct = total > 0 ? Math.round(poolDone / total * 100) : 0;
  const isFirst = cursor === 0;
  const isLast = cursor === total - 1;

  area.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:13px;color:var(--text-meta)">${poolDone}/${total} 완료 (${poolPct}%)</span>
      <span style="font-size:13px;color:var(--text2);font-weight:500;font-variant-numeric:tabular-nums">${cursor + 1} / ${total}</span>
    </div>
    <div class="bar-track" style="height:5px;margin-bottom:12px">
      <div class="bar-fill" style="width:${poolPct}%;background:var(--teal)"></div>
    </div>
    ${renderQCard(q, ans, { mode: 'archive' })}
    <div class="act-row" style="justify-content:space-between;margin-top:12px">
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" data-action="arch-move" data-dir="-1" ${isFirst ? 'disabled' : ''}>← 이전</button>
        <button class="btn btn-sm" data-action="arch-move" data-dir="1" ${isLast ? 'disabled' : ''}>다음 →</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-sm" data-action="arch-bookmark" data-qid="${escapeHtml(q.id)}">
          ${isBookmarked(q.id) ? '⭐ 북마크됨' : '☆ 북마크'}
        </button>
      </div>
    </div>`;

  if (!ans) startSolveTimer();
}

function handleArchSelect(idx) {
  const S = getState();
  const pool = getArchivePool();
  if (!pool.length) return;
  const q = pool[S.archiveCursor];
  if (!q) return;
  const hist = S.archiveHistory[q.id];
  if (hist) return;
  if (idx < 1 || idx > q.options.length) return;
  const correct = idx === q.answer;
  const solveSec = endSolveTimer();
  recordAnswer({ qid: q.id, q, selected: idx, correct, source: 'archive', solveSec });
  const tc = document.getElementById('topic-chips');
  if (tc) tc.innerHTML = buildTopicChips();
  renderArchiveQuestion();
  announce(correct ? '정답입니다' : '오답입니다');
  if (!correct) toast('오답노트에 자동 추가됐어요', 'info', 1800);
}

function handleArchBookmark() {
  const S = getState();
  const pool = getArchivePool();
  const q = pool[S.archiveCursor];
  if (!q) return;
  const added = toggleBookmark(q.id);
  toast(added ? '⭐ 북마크에 추가됐어요' : '북마크에서 제거됐어요', 'info', 1500);
  renderArchiveQuestion();
}

export function archMove(dir) {
  const S = getState();
  const pool = getArchivePool();
  S.archiveCursor = Math.max(0, Math.min(pool.length - 1, S.archiveCursor + dir));
  saveState();
  const tc = document.getElementById('topic-chips');
  if (tc) tc.innerHTML = buildTopicChips();
  renderArchiveQuestion();
}

export function archJumpTo(i) {
  const S = getState();
  const pool = getArchivePool();
  S.archiveCursor = Math.max(0, Math.min(pool.length - 1, i));
  saveState();
  const tc = document.getElementById('topic-chips');
  if (tc) tc.innerHTML = buildTopicChips();
  renderArchiveQuestion();
}

export function archSetExam(v) {
  const S = getState();
  S.archFilter.exam = v ? parseInt(v, 10) : null;
  S.archiveCursor = 0;
  saveState();
  renderArchive();
}

export function switchSubjectArch(s) {
  const S = getState();
  S.subject = s;
  S.archiveCursor = 0;
  saveState();
  renderArchive();
}

export function jumpArchive(s, e) {
  const S = getState();
  S.subject = s;
  S.archFilter.exam = parseInt(e, 10);
  S.archiveCursor = 0;
  saveState();
  renderArchive();
}

export function archBookmark(qid) {
  const added = toggleBookmark(qid);
  toast(added ? '⭐ 북마크에 추가됐어요' : '북마크에서 제거됐어요', 'info', 1500);
  renderArchiveQuestion();
}
