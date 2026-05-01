/**
 * 통계 탭
 * - D-day / streak hero 카드 (큼)
 * - 다른 stat은 작은 그리드
 * - 평균 풀이시간 페이스 가이드 (#A)
 */
import { getState, getStorageUsage } from '../storage.js';
import { SUBJS, SUBJ_KEYS, avgSolveSec } from '../state.js';
import { todayKey, weekKey, escapeHtml, examDday } from '../utils.js';
import { queryById, getDB } from '../db.js';

export function renderStats() {
  const S = getState();
  const el = document.getElementById('page-stats');
  if (!el) return;

  const week = weekKey();
  const ws = S.weeklyStats[week] || { total: 0, correct: 0, bySubject: {} };
  const pct = ws.total > 0 ? Math.round(ws.correct / ws.total * 100) : 0;
  const today = todayKey();
  const todayData = S.todayAnswers[today] || {};
  const todayTotal = Object.values(todayData).reduce((s, arr) => s + (arr?.length || 0), 0);
  const todayOk = Object.values(todayData).reduce((s, arr) => s + (arr?.filter(a => a.correct)?.length || 0), 0);
  const allWeeks = Object.entries(S.weeklyStats).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  const sbColors = { S1: 'var(--accent)', S2: 'var(--green)', S3: 'var(--amber)', S4: 'var(--purple)' };

  const dday = examDday();
  const avgSec = avgSolveSec();
  const targetSec = 90; // 시험 평균 페이스
  const usage = getStorageUsage();

  // 단원별 약점
  const topicStats = {};
  Object.entries(S.archiveHistory).forEach(([qid, h]) => {
    const q = queryById(qid);
    if (!q) return;
    const key = `${q.subject}:${q.topic}`;
    if (!topicStats[key]) topicStats[key] = { subject: q.subject, topic: q.topic, total: 0, correct: 0 };
    topicStats[key].total++;
    if (h.correct) topicStats[key].correct++;
  });
  const weakTopics = Object.values(topicStats)
    .filter(t => t.total >= 2)
    .map(t => ({ ...t, accuracy: t.correct / t.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  el.innerHTML = `
    <!-- Hero 카드 (D-day, streak) -->
    <div class="stat-hero-grid" style="margin-top:18px">
      <div class="stat-hero dday">
        <div class="stat-lbl">시험까지</div>
        <div class="stat-val">D-${dday.days}</div>
        <div class="stat-sub">${dday.date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} (토)</div>
      </div>
      <div class="stat-hero streak">
        <div class="stat-lbl">연속 학습</div>
        <div class="stat-val">${S.streak.current}<span style="font-size:18px;color:var(--text-meta);margin-left:2px">일</span></div>
        <div class="stat-sub">최장 ${S.streak.longest}일</div>
      </div>
    </div>

    <!-- 일반 stat 카드 (작게) -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-lbl">이번 주 정답률</div>
        <div class="stat-val">${pct}<sup>%</sup></div>
        <div class="stat-sub">${ws.correct}/${ws.total} 정답</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">오늘 풀이</div>
        <div class="stat-val">${todayTotal}<sup>문제</sup></div>
        <div class="stat-sub">${todayOk} 정답</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">오답노트</div>
        <div class="stat-val">${S.wrongNotes.length}<sup></sup></div>
        <div class="stat-sub">누적 오답</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">기출 풀이</div>
        <div class="stat-val">${Object.keys(S.archiveHistory).length}<sup></sup></div>
        <div class="stat-sub">/ ${getDB().length} 문항</div>
      </div>
    </div>

    ${avgSec != null ? `<div class="chart-sec">
      <h3>풀이 페이스</h3>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
          <span style="font-size:13px;color:var(--text2)">현재 평균</span>
          <span style="font-size:24px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;letter-spacing:-0.02em">${avgSec}<span style="font-size:14px;color:var(--text-meta);margin-left:2px">초/문제</span></span>
        </div>
        <div class="bar-track" style="height:8px;position:relative">
          <div class="bar-fill" style="width:${Math.min(100, (avgSec / 180) * 100)}%;background:${avgSec <= targetSec ? 'var(--green)' : 'var(--amber)'}"></div>
          <div style="position:absolute;left:${(targetSec / 180) * 100}%;top:-4px;height:16px;width:2px;background:var(--accent2)" title="목표 페이스 ${targetSec}초"></div>
        </div>
        <div style="font-size:12px;color:var(--text-meta);margin-top:8px;line-height:1.5">
          ${avgSec <= targetSec
            ? `✓ 시험 평균 페이스(${targetSec}초) 안에 풀고 있어요. 좋습니다.`
            : `시험은 평균 <strong>${targetSec}초/문제</strong> 페이스가 필요해요. ${avgSec - targetSec}초 단축하면 시험에서 ${Math.round((avgSec - targetSec) * 0.4)}분 여유가 생깁니다.`}
        </div>
      </div>
    </div>` : ''}

    <div class="chart-sec">
      <h3>주차별 정답률 (최근 6주)</h3>
      ${allWeeks.length === 0
        ? '<div class="empty" style="padding:20px"><div class="empty-icon">📈</div>아직 학습 기록이 없습니다.</div>'
        : allWeeks.map(([wk, d]) => {
            const p = d.total > 0 ? Math.round(d.correct / d.total * 100) : 0;
            const lbl = wk === week ? '이번 주' : wk.replace(/.*-W/, 'W');
            return `<div class="bar-row">
              <span class="bar-lbl">${escapeHtml(lbl)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${p}%;background:var(--accent)"></div></div>
              <span class="bar-pct">${p}%</span>
            </div>`;
          }).join('')}
    </div>

    ${ws.total > 0 ? `<div class="chart-sec">
      <h3>이번 주 과목별</h3>
      ${SUBJ_KEYS.map(s => {
        const sb = ws.bySubject?.[s] || { total: 0, correct: 0 };
        const p = sb.total > 0 ? Math.round(sb.correct / sb.total * 100) : 0;
        return `<div class="bar-row">
          <span class="bar-lbl">${escapeHtml(SUBJS[s].name.replace('·실무', '').replace('법령', ''))}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${sbColors[s]}"></div></div>
          <span class="bar-pct">${sb.correct}/${sb.total}</span>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${weakTopics.length > 0 ? `<div class="chart-sec">
      <h3>약점 단원 Top 5</h3>
      <div style="font-size:12px;color:var(--text-meta);margin-bottom:10px">정답률이 낮은 단원입니다. 우선 학습을 권장해요.</div>
      ${weakTopics.map(t => {
        const p = Math.round(t.accuracy * 100);
        return `<div class="bar-row">
          <span class="bar-lbl" style="font-size:12px;flex-shrink:0">${escapeHtml(SUBJS[t.subject].name.split('·')[0])}</span>
          <span style="font-size:13px;color:var(--text2);flex:1">${escapeHtml(t.topic)}</span>
          <div class="bar-track" style="flex:0 0 80px"><div class="bar-fill" style="width:${p}%;background:${p < 50 ? 'var(--red)' : 'var(--amber)'}"></div></div>
          <span class="bar-pct">${p}%</span>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div class="chart-sec">
      <h3>데이터 백업</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" data-action="export-backup">📥 학습 데이터 내보내기</button>
        <label class="btn btn-sm" style="cursor:pointer">
          📤 학습 데이터 가져오기
          <input type="file" accept="application/json" data-action="import-backup" style="display:none">
        </label>
        <button class="btn btn-sm btn-danger" data-action="reset-data">🗑 전체 초기화</button>
      </div>
      <div style="font-size:11px;color:var(--text-meta);margin-top:8px">
        저장 공간: ${usage.usedKB}KB / ${usage.quotaKB}KB (${Math.round(usage.ratio * 100)}%)
        ${usage.ratio > 0.8 ? ' — ⚠️ 백업 권장' : ''}
      </div>
    </div>`;
}
