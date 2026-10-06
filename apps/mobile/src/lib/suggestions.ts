// [공유 로직 사본] 원본: web/src/lib/suggestions.ts (2026-10-06 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.

import { SUGGESTION_WINDOW_DAYS } from './constants';
import { addDays } from './recordDate';

/** 하루치 기록 값. value 가 null 이면 그날 그 항목은 "안 적음". */
export interface DayValue {
  /** 'YYYY-MM-DD' (daily_logs.record_date) */
  recordDate: string;
  value: number | null | undefined;
}

/**
 * 오늘을 뺀 최근 N일(기본 7일) 중 "기록이 있는 날"의 값만 모은다.
 * 범위: [today - N, today - 1]. 같은 날짜가 여러 번 있으면 마지막 값을 쓴다.
 */
function collectRecentValues(logs: DayValue[], today: string, windowDays: number): number[] {
  const from = addDays(today, -windowDays);
  const to = addDays(today, -1);
  const byDate = new Map<string, number>();
  for (const log of logs) {
    if (log.recordDate < from || log.recordDate > to) continue;
    if (log.value === null || log.value === undefined || Number.isNaN(log.value)) continue;
    byDate.set(log.recordDate, log.value);
  }
  return [...byDate.values()];
}

/**
 * 숫자형 제안값(체중 kg, 음수 ml 등): 최근 N일 기록 평균. 기록이 없으면 null.
 * @param decimals 소수 자릿수 (체중 2, ml 0 등)
 */
export function suggestNumber(
  logs: DayValue[],
  today: string,
  decimals = 2,
  windowDays: number = SUGGESTION_WINDOW_DAYS,
): number | null {
  const values = collectRecentValues(logs, today, windowDays);
  if (values.length === 0) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const factor = 10 ** decimals;
  return Math.round(avg * factor) / factor;
}

/**
 * 단계형 제안값(식사 food_level, 음수 water_level: 1=조금 2=보통 3=많이):
 * 최근 N일 기록 평균을 반올림(.5 는 올림)한다. 기록이 없으면 null.
 */
export function suggestLevel(
  logs: DayValue[],
  today: string,
  windowDays: number = SUGGESTION_WINDOW_DAYS,
): number | null {
  const values = collectRecentValues(logs, today, windowDays);
  if (values.length === 0) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.min(3, Math.max(1, Math.round(avg)));
}
