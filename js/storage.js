/**
 * localStorage 기반 영속 저장 (프로필 분리)
 * - 활성 프로필별로 독립된 키 사용
 * - debounce된 자동 저장
 * - 마이그레이션 키 (version)
 * - QuotaExceeded 에러 처리
 * - 백업/복원 (JSON)
 */
import { profileStorageKey, getActiveProfile } from './profile.js';

const VERSION = 2;

const DEFAULT_STATE = {
  version: VERSION,
  // UI
  tab: 'daily',
  subject: 'S1',
  mode: 'archive',
  theme: 'dark',
  // 필터
  filter: { exam: null, topic: null, unseenOnly: false },
  archFilter: { exam: null },
  archiveCursor: 0,
  // 학습 데이터
  todayAnswers: {},
  archiveHistory: {},
  wrongNotes: [],
  bookmarks: [],
  weeklyStats: {},
  // 모의고사 결과
  examResults: [],
  // 메타
  streak: { current: 0, longest: 0, lastDate: null },
};

function deepMerge(target, source) {
  if (Array.isArray(source)) return [...source];
  if (typeof source !== 'object' || source === null) return source;
  const out = { ...target };
  for (const k of Object.keys(source)) {
    out[k] = (k in target) ? deepMerge(target[k], source[k]) : source[k];
  }
  return out;
}

let _state = null;
let _stateProfileId = null; // 현재 _state가 어느 프로필 것인지 추적
let _saveTimer = null;
let _saveErrors = 0;

export function loadState() {
  const profileId = getActiveProfile();
  if (!profileId) throw new Error('프로필이 선택되지 않았습니다.');
  // 프로필이 바뀌었으면 새로 로드
  if (_state && _stateProfileId === profileId) return _state;
  try {
    const raw = localStorage.getItem(profileStorageKey(profileId));
    if (!raw) {
      _state = structuredClone(DEFAULT_STATE);
    } else {
      const parsed = JSON.parse(raw);
      _state = deepMerge(structuredClone(DEFAULT_STATE), parsed);
      _state.version = VERSION;
    }
    _stateProfileId = profileId;
  } catch (e) {
    console.warn('상태 로드 실패, 기본값 사용:', e);
    _state = structuredClone(DEFAULT_STATE);
    _stateProfileId = profileId;
  }
  return _state;
}

// 프로필 전환 시 호출 (메모리 캐시 비우기)
export function clearStateCache() {
  _state = null;
  _stateProfileId = null;
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
}

export function getState() {
  return _state || loadState();
}

// localStorage 사이즈 측정 (KB 단위)
const QUOTA_KB = 5000; // 5MB (브라우저 표준)
const WARN_THRESHOLD = 0.8; // 80% 초과 시 경고
let _quotaWarnedAt = 0;

export function getStorageSize() {
  try {
    const profileId = getActiveProfile();
    if (!profileId) return 0;
    const data = localStorage.getItem(profileStorageKey(profileId)) || '';
    return Math.round(new Blob([data]).size / 1024); // KB
  } catch {
    return 0;
  }
}

export function getStorageUsage() {
  const used = getStorageSize();
  return { usedKB: used, quotaKB: QUOTA_KB, ratio: used / QUOTA_KB };
}

// attempts 배열을 최근 5개로 제한 (히스토리 누적 방지)
function pruneAttempts() {
  if (!_state.archiveHistory) return;
  for (const k of Object.keys(_state.archiveHistory)) {
    const h = _state.archiveHistory[k];
    if (h.attempts && h.attempts.length > 5) {
      h.attempts = h.attempts.slice(-5);
    }
  }
  // 90일 이상 지난 todayAnswers도 제거
  const cutoff = Date.now() - 90 * 86400000;
  for (const date of Object.keys(_state.todayAnswers || {})) {
    const ts = new Date(date).getTime();
    if (ts < cutoff) delete _state.todayAnswers[date];
  }
}

export function saveState() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const profileId = getActiveProfile();
      if (!profileId) return;
      pruneAttempts();
      localStorage.setItem(profileStorageKey(profileId), JSON.stringify(_state));
      _saveErrors = 0;
      const usage = getStorageUsage();
      if (usage.ratio > WARN_THRESHOLD && Date.now() - _quotaWarnedAt > 86400000) {
        _quotaWarnedAt = Date.now();
        import('./utils.js').then(({ toast }) => {
          toast(`저장 공간이 ${Math.round(usage.ratio * 100)}% 사용 중입니다. 백업을 권장합니다.`, 'info', 4000);
        });
      }
    } catch (e) {
      _saveErrors++;
      if (e.name === 'QuotaExceededError' && _saveErrors === 1) {
        import('./utils.js').then(({ toast }) => {
          toast('저장 공간이 부족합니다. 오답노트를 정리해주세요.', 'error', 4000);
        });
      }
      console.warn('localStorage 저장 실패:', e);
    }
  }, 250);
}

// 즉시 저장 (페이지 언로드 등)
export function flushSave() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  try {
    const profileId = getActiveProfile();
    if (!profileId || !_state) return;
    localStorage.setItem(profileStorageKey(profileId), JSON.stringify(_state));
  } catch (e) {
    console.warn('flushSave 실패:', e);
  }
}

// 백업: JSON 다운로드 (프로필 ID 포함)
export function exportBackup() {
  const profileId = getActiveProfile() || 'unknown';
  const payload = { profileId, exportedAt: new Date().toISOString(), state: _state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exam2026-${profileId}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 복원: JSON 파일에서
export function importBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (typeof data !== 'object' || !data) throw new Error('형식 오류');
        // 새 형식: { profileId, exportedAt, state } / 구 형식: state 직접
        const stateData = (data.state && typeof data.state === 'object') ? data.state : data;
        _state = deepMerge(structuredClone(DEFAULT_STATE), stateData);
        _state.version = VERSION;
        flushSave();
        resolve(_state);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// 활성 프로필 데이터 초기화 (다른 프로필은 영향 없음)
export function resetState() {
  _state = structuredClone(DEFAULT_STATE);
  flushSave();
}

// 페이지 언로드 시 자동 flush
window.addEventListener('beforeunload', flushSave);
window.addEventListener('pagehide', flushSave);
