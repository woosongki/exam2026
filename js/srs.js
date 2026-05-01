/**
 * 간격 반복 학습 (SM-2 변형)
 *
 * 기존: 오답 시 무조건 0으로 리셋 (95% 알지만 한 번 흔들린 문제도 영원히 단기)
 * 개선: ease factor 도입 — 오답 시 한 단계만 후퇴, 잦은 오답일수록 더 많이 후퇴
 */

const INTERVALS = [1, 3, 7, 14, 30, 60, 120]; // days
const EASE_INIT = 2.5;
const EASE_MIN = 1.3;

export function initSrs() {
  return {
    interval: 0,
    reps: 0,
    correctReps: 0,
    wrongStreak: 0,
    ease: EASE_INIT,
    dueAt: Date.now(),
    lastReviewed: null,
  };
}

export function updateSrs(srs, correct) {
  const now = Date.now();
  const next = { ...srs };
  next.reps = (srs.reps || 0) + 1;
  next.lastReviewed = now;

  if (correct) {
    next.correctReps = (srs.correctReps || 0) + 1;
    next.wrongStreak = 0;
    next.ease = Math.min(EASE_INIT, (srs.ease || EASE_INIT) + 0.05);
    next.interval = Math.min((srs.interval || 0) + 1, INTERVALS.length - 1);
  } else {
    next.wrongStreak = (srs.wrongStreak || 0) + 1;
    next.ease = Math.max(EASE_MIN, (srs.ease || EASE_INIT) - 0.20);
    if (next.wrongStreak === 1) {
      next.interval = Math.max(0, (srs.interval || 0) - 1);
    } else if (next.wrongStreak === 2) {
      next.interval = Math.max(0, (srs.interval || 0) - 2);
    } else {
      next.interval = 0;
    }
  }
  const baseDays = INTERVALS[next.interval];
  const days = Math.max(1, Math.round(baseDays * (next.ease / EASE_INIT)));
  next.dueAt = now + days * 86400000;
  return next;
}

export function srsLabel(srs) {
  if (!srs) return '신규';
  const baseDays = INTERVALS[srs.interval || 0];
  const days = Math.max(1, Math.round(baseDays * ((srs.ease || EASE_INIT) / EASE_INIT)));
  return `${days}일 주기`;
}

export function isDue(srs) {
  if (!srs) return true;
  return srs.dueAt <= Date.now();
}

export function timeUntilDue(srs) {
  if (!srs) return 0;
  return Math.max(0, srs.dueAt - Date.now());
}

export function sortByDue(notes) {
  return [...notes].sort((a, b) => {
    const aDue = a.srs?.dueAt || 0;
    const bDue = b.srs?.dueAt || 0;
    return aDue - bDue;
  });
}

// 내일까지 due가 될 항목 수
export function dueByTomorrow(notes) {
  const tomorrow = Date.now() + 86400000;
  return notes.filter(n => (n.srs?.dueAt ?? 0) <= tomorrow).length;
}
