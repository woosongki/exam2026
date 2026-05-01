/**
 * 프로필 관리
 * - 3명 사용자 (W, J, K)가 같은 앱을 공유
 * - localStorage 키를 프로필별로 분리
 * - 첫 진입 시 선택 화면, 이후 자동으로 마지막 프로필로 시작
 */

const PROFILE_LIST_KEY = 'exam2026_profiles';
const ACTIVE_PROFILE_KEY = 'exam2026_active_profile';
const LEGACY_KEY = 'exam2026_v2'; // 단일 사용자 시절의 키

export const PROFILES = {
  W: { id: 'W', name: 'W', color: '#3b82f6' },
  J: { id: 'J', name: 'J', color: '#10b981' },
  K: { id: 'K', name: 'K', color: '#a78bfa' },
};

export const PROFILE_IDS = ['W', 'J', 'K'];

let activeProfileId = null;

// 활성 프로필 ID 반환 (없으면 null)
export function getActiveProfile() {
  if (activeProfileId) return activeProfileId;
  try {
    activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (activeProfileId && !PROFILE_IDS.includes(activeProfileId)) {
      activeProfileId = null;
    }
  } catch {}
  return activeProfileId;
}

// 프로필 선택
export function setActiveProfile(id) {
  if (!PROFILE_IDS.includes(id)) return;
  activeProfileId = id;
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {}
}

// 프로필 정보
export function getProfileInfo(id) {
  return PROFILES[id] || null;
}

// 프로필별 storage key
export function profileStorageKey(id = activeProfileId) {
  if (!id) throw new Error('프로필이 선택되지 않았습니다.');
  return `exam2026_v2_${id}`;
}

// 레거시 단일 사용자 데이터를 W로 마이그레이션 (한 번만 실행됨)
export function migrateLegacyData() {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return false;
    // 이미 W에 데이터가 있으면 마이그레이션 스킵 (덮어쓰기 방지)
    const wKey = `exam2026_v2_W`;
    if (localStorage.getItem(wKey)) {
      // 레거시는 그대로 두기 (안전)
      return false;
    }
    localStorage.setItem(wKey, legacy);
    // 레거시 키는 백업 차원에서 유지 (사용자가 수동으로 정리 가능)
    // localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch (e) {
    console.warn('레거시 데이터 마이그레이션 실패:', e);
    return false;
  }
}

// 각 프로필의 데이터 사용량 확인 (공간 모니터링용)
export function getProfileUsage(id) {
  try {
    const data = localStorage.getItem(profileStorageKey(id)) || '';
    const bytes = new Blob([data]).size;
    return { bytes, kb: Math.round(bytes / 1024) };
  } catch {
    return { bytes: 0, kb: 0 };
  }
}

// 프로필 데이터 초기화 (선택된 프로필만)
export function resetProfileData(id) {
  try {
    localStorage.removeItem(profileStorageKey(id));
    return true;
  } catch {
    return false;
  }
}
