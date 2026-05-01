/**
 * 상태 변경 로직
 * - 답안 기록 / 오답노트 / 북마크 / streak / 풀이시간
 * - 옵저버 패턴: 상태 변경 시 구독자에게 알림 (헤더 갱신 누락 방지)
 */
import { getState, saveState } from './storage.js';
import { todayKey, weekKey } from './utils.js';
import { initSrs, updateSrs } from './srs.js';

export const SUBJS = {
  S1: { name: '중개사법·실무', sub: '공인중개사법·거래신고법·실무' },
  S2: { name: '부동산공법',    sub: '국토계획법·건축법·주택법 등' },
  S3: { name: '부동산공시법령', sub: '지적법·부동산등기법' },
  S4: { name: '부동산세법',    sub: '취득세·재산세·양도세·종부세' },
};
export const SUBJ_KEYS = ['S1', 'S2', 'S3', 'S4'];

// ── 옵저버: 상태 변경 알림 ──
const subscribers = new Set();
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
function notify(event, data) {
  for (const fn of subscribers) {
    try { fn(event, data); } catch (e) { console.warn(e); }
  }
}

// ── 답안 기록 ──
export function recordAnswer({ qid, q, selected, correct, source = 'archive', solveSec = null }) {
  const S = getState();
  const today = todayKey();
  const week = weekKey();

  // 아카이브 이력 (attempts는 최근 5개만)
  const prev = S.archiveHistory[qid];
  const attempts = [...(prev?.attempts || []), { selected, correct, ts: Date.now(), solveSec }];
  S.archiveHistory[qid] = {
    selected,
    correct,
    ts: Date.now(),
    attempts: attempts.slice(-5),
  };

  // 오늘 답안
  S.todayAnswers[today] = S.todayAnswers[today] || {};
  const subjArr = S.todayAnswers[today][q.subject] || [];
  subjArr.push({ qid, selected, correct, ts: Date.now(), source, solveSec });
  S.todayAnswers[today][q.subject] = subjArr;

  // 주차 통계
  if (!S.weeklyStats[week]) S.weeklyStats[week] = { total: 0, correct: 0, bySubject: {} };
  const ws = S.weeklyStats[week];
  ws.total++;
  if (correct) ws.correct++;
  if (!ws.bySubject[q.subject]) ws.bySubject[q.subject] = { total: 0, correct: 0 };
  ws.bySubject[q.subject].total++;
  if (correct) ws.bySubject[q.subject].correct++;

  // 페이스 통계 (평균 풀이시간)
  if (solveSec != null) {
    if (!S.paceStats) S.paceStats = { total: 0, sumSec: 0 };
    S.paceStats.total++;
    S.paceStats.sumSec += solveSec;
  }

  // streak
  updateStreak();

  // 자동 오답노트
  if (!correct) {
    addToWrongNotes(q);
  } else {
    const note = S.wrongNotes.find(n => n.id === qid);
    if (note) {
      note.srs = updateSrs(note.srs || initSrs(), true);
    }
  }

  saveState();
  notify('answer', { qid, correct, q });
  return S.archiveHistory[qid];
}

// 평균 풀이시간 (초)
export function avgSolveSec() {
  const S = getState();
  if (!S.paceStats || S.paceStats.total === 0) return null;
  return Math.round(S.paceStats.sumSec / S.paceStats.total);
}

// ── 오답노트 ──
export function addToWrongNotes(q) {
  const S = getState();
  let note = S.wrongNotes.find(n => n.id === q.id);
  if (!note) {
    note = {
      id: q.id,
      question: q.question,
      options: q.options,
      answer: q.answer,
      subject: q.subject,
      topic: q.topic,
      source: q.source,
      exam: q.exam,
      explanation: q.explanation,
      keyPoints: q.keyPoints,
      addedAt: Date.now(),
      srs: initSrs(),
    };
    S.wrongNotes.unshift(note);
  } else {
    note.srs = updateSrs(note.srs || initSrs(), false);
  }
  saveState();
  notify('wrong-changed');
  return note;
}

export function removeWrongNote(qid) {
  const S = getState();
  const idx = S.wrongNotes.findIndex(n => n.id === qid);
  if (idx >= 0) {
    S.wrongNotes.splice(idx, 1);
    saveState();
    notify('wrong-changed');
    return true;
  }
  return false;
}

// ── 북마크 ──
export function toggleBookmark(qid) {
  const S = getState();
  const idx = S.bookmarks.indexOf(qid);
  if (idx >= 0) {
    S.bookmarks.splice(idx, 1);
    saveState();
    return false;
  }
  S.bookmarks.push(qid);
  saveState();
  return true;
}

export function isBookmarked(qid) {
  return getState().bookmarks.includes(qid);
}

// ── streak ──
function updateStreak() {
  const S = getState();
  const today = todayKey();
  const last = S.streak.lastDate;
  if (last === today) return;
  if (!last) {
    S.streak.current = 1;
  } else {
    const lastD = new Date(last);
    const todayD = new Date(today);
    const diff = Math.round((todayD - lastD) / 86400000);
    if (diff === 1) {
      S.streak.current++;
    } else {
      S.streak.current = 1;
    }
  }
  S.streak.lastDate = today;
  if (S.streak.current > S.streak.longest) S.streak.longest = S.streak.current;
  notify('streak-changed', S.streak);
}

// ── 모의고사 ──
export function saveExamResult(result) {
  const S = getState();
  S.examResults.unshift(result);
  if (S.examResults.length > 50) S.examResults.pop();
  saveState();
  notify('exam-finished', result);
}

// ── 모의고사 진행 중 자동 저장 ──
export function saveExamSession(session) {
  const S = getState();
  S.examSession = session;
  saveState();
}

export function loadExamSession() {
  return getState().examSession || null;
}

export function clearExamSession() {
  const S = getState();
  delete S.examSession;
  saveState();
}
