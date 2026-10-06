// [공유 로직 사본] 원본: web/src/lib/constants.ts (2026-10-06 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.

// 시니어펫 노트 — 앱 전체에서 쓰는 규칙 상수
// 근거: docs/decisions/2026-10-06-MVP-세부-결정.md (대표 결정 3·4·5)

/**
 * 기록 날짜 기준 시각(시). 이 시각 "전"에 체크한 투약은 전날 기록으로 저장한다.
 * 예: 4 → 00:00~03:59 체크는 전날, 04:00부터는 당일.
 * 실제 체크 시각은 med_logs.taken_at 에 그대로 남는다.
 */
export const RECORD_DAY_CUTOFF_HOUR = 4;

/** 기록 날짜를 계산할 때 쓰는 기본 시간대. (MVP 사용자는 한국 거주 가정) */
export const RECORD_TIME_ZONE = 'Asia/Seoul';

/** 투약 체크 근처·도움말·리포트에 보여 줄 안내 문구 (대표 결정 3) */
export const RECORD_DATE_NOTICE = '새벽 4시 전 투약은 전날 기록으로 저장돼요';

/** 제안값(미리 채우기)을 계산할 때 볼 기간: 오늘을 뺀 최근 N일 (대표 결정 5) */
export const SUGGESTION_WINDOW_DAYS = 7;

/** 화면 하단·리포트에 고정하는 면책 문구 (PLAN 포지셔닝 원칙) */
export const DISCLAIMER = '본 기록은 의료적 판단을 대신하지 않습니다.';
