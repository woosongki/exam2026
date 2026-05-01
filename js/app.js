/**
 * 앱 엔트리
 */
import { loadState, getState, saveState, exportBackup, importBackup, resetState, clearStateCache, flushSave } from './storage.js';
import { todayKey, escapeHtml, examDday, toast, confirmModal } from './utils.js';
import { showHelpModal } from './keyboard.js';
import { setDB } from './db.js';
import { subscribe } from './state.js';
import { getActiveProfile, setActiveProfile, getProfileInfo, migrateLegacyData, PROFILES } from './profile.js';
import { renderProfilePick } from './render/profile_pick.js';

import { initMemo, renderMemo, memoSetSubj, memoSearch, memoToggle } from './render/memo.js';
import { renderDaily, switchSubject, switchMode, applyFilter, resetFilter, newQuestion, nextSubject, handleSelect as dailySelect, handleNext as dailyNext, handleBookmark as dailyBookmark } from './render/daily.js';
import { renderArchive, archMove, archJumpTo, archSetExam, switchSubjectArch, jumpArchive, archBookmark, archSelectOption } from './render/archive.js';
import { renderStats } from './render/stats.js';
import { renderWrong, wrongFilter, wrongDelete, wrongReview, wrongBack, wrongSelectOption } from './render/wrong.js';
import { renderExam, startExam, examAnswer, examNext, examPrev, examJump, examFlag, submitExam, examRestart, examReviewWrong, examGiveUp, tryResumeExam } from './render/exam.js';

const TABS = ['daily', 'archive', 'exam', 'stats', 'memo', 'wrong'];
const DATA_VERSION = 'v2';

async function loadData() {
  try {
    // 캐시 버스팅: 쿼리 파라미터로 버전 (#16)
    const [dbResp, memoResp] = await Promise.all([
      fetch(`./data/db.json?v=${DATA_VERSION}`),
      fetch(`./data/memo.json?v=${DATA_VERSION}`),
    ]);
    if (!dbResp.ok || !memoResp.ok) throw new Error('데이터 로드 실패');
    const DB = await dbResp.json();
    const MEMO = await memoResp.json();
    setDB(DB);  // 인덱스 빌드
    initMemo(MEMO);
    return { DB, MEMO };
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <div class="empty" style="margin-top:60px">
        <div class="empty-icon">⚠️</div>
        데이터를 불러오지 못했습니다.<br>
        <span style="font-size:13px">${escapeHtml(e.message)}</span><br><br>
        <button class="btn btn-primary" onclick="location.reload()">새로고침</button>
      </div>`;
    throw e;
  }
}

export function switchTab(t) {
  if (!TABS.includes(t)) return;
  const S = getState();
  S.tab = t;
  saveState();
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('on', b.dataset.t === t);
    b.setAttribute('aria-selected', b.dataset.t === t);
  });
  TABS.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.style.display = p === t ? 'block' : 'none';
  });
  if (t === 'daily') renderDaily();
  if (t === 'archive') renderArchive();
  if (t === 'exam') renderExam();
  if (t === 'stats') renderStats();
  if (t === 'memo') renderMemo();
  if (t === 'wrong') renderWrong();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀';
}

function toggleTheme() {
  const S = getState();
  S.theme = S.theme === 'light' ? 'dark' : 'light';
  applyTheme(S.theme);
  saveState();
}

function refreshHeader(opts = {}) {
  const S = getState();
  const dday = examDday();
  const ddayEl = document.getElementById('hdr-dday');
  const streakEl = document.getElementById('hdr-streak');
  if (ddayEl) ddayEl.textContent = `📅 D-${dday.days}`;
  if (streakEl) {
    if (S.streak.current > 0) {
      streakEl.style.display = '';
      streakEl.textContent = `🔥 ${S.streak.current}일 연속`;
      // bump 애니메이션
      if (opts.bump) {
        streakEl.classList.remove('streak-bump');
        // 강제 리플로우
        void streakEl.offsetWidth;
        streakEl.classList.add('streak-bump');
      }
    } else {
      streakEl.style.display = 'none';
    }
  }
}

const ACTIONS = {
  'switch-tab': ({ t }) => switchTab(t),

  'theme-toggle': () => toggleTheme(),
  'show-help': () => showHelpModal(),
  'switch-profile': () => switchProfile(),

  'switch-subject': ({ s }) => switchSubject(s),
  'switch-mode': ({ m }) => switchMode(m),
  'reset-filter': () => resetFilter(),
  'new-question': () => newQuestion(),
  'next-subject': () => nextSubject(),
  'goto-stats': () => switchTab('stats'),
  'goto-wrong': () => switchTab('wrong'),
  'select-option': ({ idx }) => {
    const tab = getState().tab;
    if (tab === 'daily') dailySelect(parseInt(idx, 10));
    else if (tab === 'archive') archSelectOption(parseInt(idx, 10));
    else if (tab === 'wrong') wrongSelectOption(parseInt(idx, 10));
  },

  'arch-move': ({ dir }) => archMove(parseInt(dir, 10)),
  'arch-jump-to': ({ i }) => archJumpTo(parseInt(i, 10)),
  'arch-set-exam': ({ v }) => archSetExam(v),
  'switch-subject-arch': ({ s }) => switchSubjectArch(s),
  'jump-archive': ({ s, e }) => jumpArchive(s, e),
  'arch-bookmark': ({ qid }) => archBookmark(qid),

  'start-exam': ({ exam, set }) => startExam(exam, set),
  'exam-answer': ({ idx }) => examAnswer(parseInt(idx, 10)),
  'exam-next': () => examNext(),
  'exam-prev': () => examPrev(),
  'exam-jump': ({ i }) => examJump(i),
  'exam-flag': () => examFlag(),
  'exam-give-up': () => examGiveUp(),
  'exam-submit': () => submitExam(),
  'exam-restart': () => examRestart(),
  'exam-review-wrong': () => examReviewWrong(),

  'memo-subj': ({ s }) => memoSetSubj(s),
  'memo-toggle': ({ id }) => memoToggle(id),

  'wrong-filter': ({ f, s }) => wrongFilter(f, s),
  'wrong-delete': ({ i, qid }) => wrongDelete(i, qid),
  'wrong-review': ({ qid }) => wrongReview(qid),
  'wrong-back': () => wrongBack(),

  'export-backup': () => {
    exportBackup();
    toast('학습 데이터를 내려받았어요', 'success');
  },
  'reset-data': async () => {
    const id = getActiveProfile();
    const p = id ? getProfileInfo(id) : null;
    const ok = await confirmModal({
      title: '전체 초기화',
      message: `${p ? p.name + ' 프로필의 ' : ''}모든 학습 기록(오답노트, 통계, 진도, 북마크)이 삭제됩니다. 다른 프로필은 영향받지 않습니다.`,
      confirmText: '초기화',
      danger: true,
    });
    if (ok) {
      resetState();
      applyTheme('dark');
      refreshHeader();
      switchTab('daily');
      toast('초기화됐습니다', 'info');
    }
  },
};

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (target.tagName === 'INPUT' && target.type !== 'button') return;
  if (target.tagName === 'SELECT') return;
  const fn = ACTIONS[action];
  if (fn) {
    e.preventDefault();
    fn(target.dataset);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const target = e.target.closest('[data-action="jump-archive"]');
  if (target) {
    e.preventDefault();
    ACTIONS['jump-archive'](target.dataset);
  }
});

document.addEventListener('change', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'filter-exam') {
    applyFilter({ exam: target.value });
  } else if (action === 'filter-topic') {
    applyFilter({ topic: target.value });
  } else if (action === 'filter-unseen') {
    applyFilter({ unseenOnly: target.checked });
  } else if (action === 'import-backup') {
    const file = target.files?.[0];
    if (file) {
      importBackup(file)
        .then(() => {
          applyTheme(getState().theme);
          refreshHeader();
          switchTab(getState().tab);
          toast('학습 데이터를 가져왔어요', 'success');
        })
        .catch(err => toast('가져오기 실패: ' + err.message, 'error', 3000));
      target.value = '';
    }
  }
});

document.addEventListener('input', (e) => {
  const target = e.target.closest('[data-action="memo-search"]');
  if (target) memoSearch(target.value);
});

async function init() {
  // 1. 데이터 먼저 로드 (프로필 무관)
  await loadData();

  // 2. 레거시 단일 사용자 데이터를 W로 마이그레이션 (한 번만)
  migrateLegacyData();

  // 3. 활성 프로필 확인
  let activeId = getActiveProfile();
  if (!activeId) {
    // 프로필 선택 화면 표시
    activeId = await new Promise(resolve => {
      renderProfilePick(resolve);
    });
    setActiveProfile(activeId);
  }

  await bootApp(activeId);
}

async function bootApp(profileId) {
  // 상태 캐시 비우고 새 프로필 로드
  clearStateCache();
  loadState();
  const S = getState();

  applyTheme(S.theme || 'dark');

  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  refreshHeader();
  refreshProfileBadge();

  // 옵저버 구독: streak 변경 시 헤더 갱신 + bump
  subscribe((event, data) => {
    if (event === 'streak-changed') {
      refreshHeader({ bump: true });
    }
    if (event === 'answer') {
      refreshHeader();
    }
  });

  const tabLabels = {
    daily: '오늘의 문제',
    archive: '기출 DB',
    exam: '모의고사',
    stats: '통계',
    memo: '핵심 암기장',
    wrong: '오답노트',
  };
  const tabsEl = document.querySelector('.tabs');
  tabsEl.innerHTML = TABS.map(t => `
    <button class="tab" data-action="switch-tab" data-t="${t}" role="tab" aria-selected="${S.tab === t}">${tabLabels[t]}</button>
  `).join('');

  const appEl = document.getElementById('app');
  TABS.forEach(t => {
    if (!document.getElementById('page-' + t)) {
      const div = document.createElement('div');
      div.id = 'page-' + t;
      div.style.display = 'none';
      div.setAttribute('role', 'tabpanel');
      appEl.appendChild(div);
    }
  });

  // 진행 중이던 시험 복구 시도
  const resumed = await tryResumeExam();
  if (resumed) {
    switchTab('exam');
  } else {
    switchTab(S.tab || 'daily');
  }
}

// 헤더 프로필 뱃지 갱신
function refreshProfileBadge() {
  const badge = document.getElementById('hdr-profile');
  if (!badge) return;
  const id = getActiveProfile();
  if (!id) return;
  const p = getProfileInfo(id);
  badge.style.setProperty('--profile-color', p.color);
  badge.innerHTML = `<span class="hdr-profile-avatar">${escapeHtml(p.name)}</span><span>${escapeHtml(p.name)}</span>`;
  badge.setAttribute('aria-label', `${p.name} 프로필 — 클릭하여 전환`);
}

// 프로필 전환
async function switchProfile() {
  const ok = await confirmModal({
    title: '프로필 전환',
    message: '다른 사용자로 전환하시겠어요? (현재 학습 내용은 자동 저장됩니다)',
    confirmText: '전환',
    cancelText: '취소',
  });
  if (!ok) return;
  flushSave();
  // 페이지를 깔끔히 리셋하고 프로필 선택 화면 띄우기
  const newId = await new Promise(resolve => renderProfilePick(resolve));
  setActiveProfile(newId);
  // 페이지 자체를 새로고침 (가장 안전)
  location.reload();
}

init().catch(e => console.error('초기화 실패:', e));
