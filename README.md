# 공인중개사 2차 학습 v2.2

기출 480문항 + 핵심 암기장 + 모의고사 + 자동 오답노트(SRS)를 갖춘 정적 웹 학습 앱. 3명 다중 프로필 지원.

## v2.2 변경사항 (다중 프로필)

- **3명 프로필 지원** (W, J, K) — 각자 학습 데이터 완전 분리
- 첫 진입 시 프로필 선택 화면 + 카드별 학습 진척 미리보기
- 헤더 우측 프로필 뱃지 클릭으로 전환
- 프로필별 색상 (W=파랑, J=초록, K=보라)
- localStorage 키 분리 (`exam2026_v2_W`, `exam2026_v2_J`, `exam2026_v2_K`)
- 기존 단일 사용자 데이터는 W로 자동 마이그레이션 (한 번만)
- 백업 파일에 프로필 ID 포함, 복원 시 현재 프로필에 적용

## v2.1 변경사항 (디자인·개발 개선)

### 디자인
- **Hero 카드**: 통계 탭의 D-day와 streak을 큰 카드로 강조, 나머지는 작은 그리드로 위계 분리
- **단색 그라데이션 매트릭스**: 신호등 색(빨/노/초) → 진도 비례 단색 그라데이션 (격려 톤)
- **진도 미니바**: 점 1개 → 0~10문제 비율 미니바 (5문제 풀어도 진도 보임)
- **컴팩트 단원 칩**: 번호 위주, 큰 화면에서만 단원명 표시 (가독성 ↑)
- **정답 펄스 + 오답 셰이크**: 답 제출 시 1초 이내 미묘한 피드백
- **streak bump 애니메이션**: 연속 학습 카운트 +1 될 때 헤더 카운터 강조
- **메타 정보색 분리**: text2/text3에 더해 text-meta 추가 (라벨·메타·비활성 구분)
- **Serif 절제**: 헤더 외 모든 수치는 Sans + tabular-nums

### 개발
- **DB 인덱스**: 매 렌더 풀스캔 → Map 기반 O(1) 조회 (`js/db.js`)
- **옵저버 패턴**: 답안 기록 시 헤더 자동 갱신 (이전엔 stale 가능성)
- **모의고사 자동 저장 & 복구**: 시험 도중 새로고침해도 sessionStorage에서 복구
- **개선된 SRS**: 무조건 0 리셋 → ease factor + 단계적 후퇴 (잘 알지만 한 번 흔들린 문제 보호)
- **localStorage 모니터링**: 80% 초과 시 사용자에게 안내, 90일 이상 todayAnswers 자동 prune, attempts 5개 제한
- **포커스 트랩**: 모달에서 Tab이 외부로 빠지지 않음
- **모달 가드**: 모달 열린 상태에서 글로벌 단축키 비활성 (Enter 충돌 방지)
- **ARIA live region**: 답 결과를 스크린 리더가 자동 안내
- **캐시 버스팅**: 데이터 파일에 버전 쿼리 추가
- **풀이시간 측정**: 평균 페이스 통계로 시험 대비 페이스 가이드

### 새 기능
- **풀이 페이스 카드**: 평균 시간이 시험 목표(90초/문제)에 비해 어떤지 시각화
- **내일까지 복습할 오답 미리보기**: 일일 탭 상단에 due 항목 수와 바로가기 버튼

## P0 + P1 통합 기능 (v2 base)

- localStorage 영속 저장
- 자동 오답노트
- 키보드 단축키 (`1~5`, `Enter/N`, `P`, `B`, `?`)
- XSS 방지 (escapeHtml 일괄)
- 라이트/다크 테마
- 백업/복원 (JSON)
- 모의고사 1·2교시 (타이머·네비·일괄 채점)
- SRS 간격 반복 (1~120일 인터벌, ease factor)
- 단원 칩 ✓/✗ 인디케이터
- 약점 단원 Top 5 분석
- 연속 학습(streak), 시험 D-day

## 폴더 구조

```
v2/
├── index.html          # 엔트리
├── vercel.json         # 캐시·보안 헤더
├── manifest.json       # PWA 메타
├── css/styles.css      # 통합 스타일
├── js/
│   ├── app.js          # 엔트리 + 이벤트 위임
│   ├── db.js           # DB 인덱스 (O(1) 조회)
│   ├── state.js        # 상태 변경 + 옵저버
│   ├── storage.js      # localStorage 영속
│   ├── srs.js          # 간격 반복 (ease factor)
│   ├── utils.js        # escape, 모달, 토스트, ARIA, 풀이시간
│   ├── keyboard.js     # 단축키
│   └── render/
│       ├── card.js     # 문제 카드 공통
│       ├── daily.js    # 오늘의 문제
│       ├── archive.js  # 기출 DB
│       ├── exam.js     # 모의고사 (자동 저장 포함)
│       ├── stats.js    # 통계 (Hero + 페이스)
│       ├── memo.js     # 암기장
│       └── wrong.js    # 오답노트 (SRS)
└── data/
    ├── db.json         # 480문항
    └── memo.json       # 핵심 암기 155항목
```

## 로컬 실행

```bash
cd v2
python3 -m http.server 8888
# http://localhost:8888
```

## GitHub Pages 배포

저장소 Settings → Pages → Source: `main` / `(root)` → Save.
1~2분 후 `https://<user>.github.io/exam2026/`에서 확인.

## Vercel 배포

`vercel.json`이 자동 적용됩니다. [vercel.com/new](https://vercel.com/new)에서 GitHub 저장소 연결 → Framework: Other → Deploy.

## 키보드 단축키

| 키 | 동작 |
|---|---|
| `1` ~ `5` | 보기 선택 |
| `Enter` / `N` | 다음 문제 |
| `P` | 이전 문제 (모의고사·아카이브) |
| `B` | 북마크 토글 |
| `?` | 도움말 |
| `Esc` | 모달 닫기 |

## 데이터 마이그레이션

기존 v2 사용자의 localStorage는 v2.1로 자동 호환됩니다. attempts 6개 이상은 자동으로 5개로 잘리고, 90일 이상 todayAnswers는 정리됩니다.

## 라이선스

학습 목적 비영리.
