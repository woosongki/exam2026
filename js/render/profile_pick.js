/**
 * 프로필 선택 화면 렌더러
 */
import { PROFILES, PROFILE_IDS, getProfileUsage, profileStorageKey } from '../profile.js';
import { escapeHtml } from '../utils.js';

// 각 프로필의 학습 진척 요약 (선택 화면에서 미리 보여주기)
function getProfileSummary(id) {
  try {
    const raw = localStorage.getItem(profileStorageKey(id));
    if (!raw) return { hasData: false };
    const s = JSON.parse(raw);
    const wrongCount = (s.wrongNotes || []).length;
    const archiveCount = Object.keys(s.archiveHistory || {}).length;
    const streak = s.streak?.current || 0;
    return {
      hasData: archiveCount > 0,
      wrongCount,
      archiveCount,
      streak,
    };
  } catch {
    return { hasData: false };
  }
}

// 프로필 선택 화면 표시
export function renderProfilePick(onPick) {
  const existing = document.querySelector('.profile-pick');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.className = 'profile-pick';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', '학습 프로필 선택');

  const cardsHtml = PROFILE_IDS.map(id => {
    const p = PROFILES[id];
    const sum = getProfileSummary(id);
    const meta = sum.hasData
      ? `${sum.archiveCount}문제 · ${sum.streak}일 연속`
      : '학습 시작 전';
    return `<button class="profile-card" data-profile="${id}"
              style="--profile-color:${p.color}"
              aria-label="${escapeHtml(p.name)} 프로필로 시작">
      <span class="profile-avatar">${escapeHtml(p.name)}</span>
      <span class="profile-name">${escapeHtml(p.name)}</span>
      <span class="profile-meta">${escapeHtml(meta)}</span>
    </button>`;
  }).join('');

  wrap.innerHTML = `
    <h2>누구의 학습이에요?</h2>
    <p>각자의 진도와 오답이 따로 저장됩니다.</p>
    <div class="profile-cards">${cardsHtml}</div>`;

  wrap.addEventListener('click', (e) => {
    const card = e.target.closest('.profile-card');
    if (!card) return;
    const id = card.dataset.profile;
    if (PROFILE_IDS.includes(id)) {
      wrap.style.transition = 'opacity 0.25s';
      wrap.style.opacity = '0';
      setTimeout(() => {
        wrap.remove();
        onPick(id);
      }, 220);
    }
  });

  // 키보드: 1/2/3으로 빠른 선택
  const keyHandler = (e) => {
    if (e.key === '1') { wrap.querySelector('[data-profile="W"]')?.click(); }
    else if (e.key === '2') { wrap.querySelector('[data-profile="J"]')?.click(); }
    else if (e.key === '3') { wrap.querySelector('[data-profile="K"]')?.click(); }
  };
  document.addEventListener('keydown', keyHandler);
  // 정리
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      document.removeEventListener('keydown', keyHandler);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });

  document.body.appendChild(wrap);
  // 첫 카드에 포커스
  setTimeout(() => wrap.querySelector('.profile-card')?.focus(), 50);
}
