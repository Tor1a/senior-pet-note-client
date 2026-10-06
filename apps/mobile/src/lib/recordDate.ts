// [공유 로직 사본] 원본: web/src/lib/recordDate.ts (2026-10-06 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.

import { RECORD_DAY_CUTOFF_HOUR, RECORD_TIME_ZONE } from './constants';

const HOUR_MS = 60 * 60 * 1000;

/**
 * 지정한 시간대에서 Date 의 달력 날짜를 'YYYY-MM-DD' 로 돌려준다.
 * (en-CA 로캘은 날짜를 YYYY-MM-DD 형식으로 출력한다)
 */
function formatDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * 투약 체크 시각(takenAt)으로 기록 날짜(record_date)를 계산한다. (대표 결정 3)
 *
 * - 기준 시간대(기본 Asia/Seoul)에서 00:00~03:59 에 체크하면 "전날" 날짜.
 * - 04:00 이후는 당일 날짜.
 * - 구현: 체크 시각에서 기준 시각(4시간)을 뺀 뒤 그 시간대의 달력 날짜를 취한다.
 *   한국은 서머타임이 없어 이 방식이 정확하다.
 *
 * @returns 'YYYY-MM-DD'
 */
export function toRecordDate(
  takenAt: Date,
  timeZone: string = RECORD_TIME_ZONE,
  cutoffHour: number = RECORD_DAY_CUTOFF_HOUR,
): string {
  if (Number.isNaN(takenAt.getTime())) {
    throw new RangeError('toRecordDate: 올바르지 않은 날짜입니다.');
  }
  const shifted = new Date(takenAt.getTime() - cutoffHour * HOUR_MS);
  return formatDateInZone(shifted, timeZone);
}

/**
 * 'YYYY-MM-DD' 날짜에 일수를 더하거나 뺀다. (시간대와 무관한 순수 달력 계산)
 */
export function addDays(recordDate: string, days: number): string {
  const [y, m, d] = recordDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}
