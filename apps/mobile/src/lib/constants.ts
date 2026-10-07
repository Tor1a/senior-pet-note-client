// [공유 로직 사본] 원본: web/src/lib/constants.ts (2026-10-07 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 시니어펫 노트 — 앱 전체에서 쓰는 문구·상수
// 기록 날짜(새벽 4시 규칙)·제안값(최근 7일 평균)·새벽 4시 안내 문구는 서버가 계산해서 내려준다
// (docs/api-today.md). 웹에는 계산 규칙을 두지 않는다.

/** 화면 하단·리포트에 고정하는 면책 문구 (PLAN 포지셔닝 원칙) */
export const DISCLAIMER = '본 기록은 의료적 판단을 대신하지 않습니다.';

/** 사진 업로드 제한 (계약: jpeg/png/webp, 5MB 이하) */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 메모 최대 글자 수 (화면 기준) */
export const MEMO_MAX_LENGTH = 200;
