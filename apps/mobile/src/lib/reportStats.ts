// [공유 로직 사본] 원본: web/src/lib/reportStats.ts (2026-10-08 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 병원 방문 리포트의 표시용 집계 (체중 첫·마지막·최소·최대, 기록 없는 날, 메모, 기간 자르기)
// 기존 historyStats 의 함수를 고치지 않고 가져다 쓴다. 기록 날짜·기간은 서버가 준 days 만 쓰고, 평가·판정은 하지 않는다.
// 근거: .company/plans/병원-방문-리포트.md 2-2·6장
import { lastNDays, weightPoints, type WeightPoint } from './historyStats';
import type { HistoryDay } from './petApi';

/** 리포트에서 고를 수 있는 기간(일). 기본 14일 */
export type ReportRange = 7 | 14 | 30;
export const REPORT_RANGES: ReportRange[] = [7, 14, 30];
export const DEFAULT_REPORT_RANGE: ReportRange = 14;

/** 증상·메모 목록을 한 번에 보여 주는 최대 건수 (넘으면 "나머지 n건" 문구로 알린다) */
export const REPORT_LIST_LIMIT = 12;

/** 주소 등에서 온 값이 7/14/30 이면 그 값, 아니면 14 */
export function parseReportRange(value: string | number | null | undefined): ReportRange {
  const n = typeof value === 'string' ? Number(value) : value;
  return n === 7 || n === 14 || n === 30 ? n : DEFAULT_REPORT_RANGE;
}

/** 받은 days(오름차순)의 마지막 n일. historyStats.lastNDays 를 그대로 쓴다 */
export function reportDays(days: HistoryDay[], range: ReportRange): HistoryDay[] {
  return lastNDays(days, range);
}

/** 센트(1/100 kg) 정수로 비교한다 (부동소수 오차 방지: 4.1 + 0.2 같은 값끼리 같은지 판단) */
function cents(kg: number): number {
  return Math.round(kg * 100);
}

export interface WeightExtremes {
  /** 체중을 적은 날 수 */
  count: number;
  first: WeightPoint | null;
  last: WeightPoint | null;
  /** 가장 낮은 기록. 같은 값이 여러 날이면 가장 이른 날 */
  min: WeightPoint | null;
  /** 가장 높은 기록. 같은 값이 여러 날이면 가장 이른 날 */
  max: WeightPoint | null;
}

/** 체중 첫·마지막·최소·최대 (숫자 비교일 뿐, 좋고 나쁨을 말하지 않는다) */
export function weightExtremes(days: HistoryDay[]): WeightExtremes {
  const points = weightPoints(days);
  let min: WeightPoint | null = null;
  let max: WeightPoint | null = null;
  for (const p of points) {
    if (min === null || cents(p.weightKg) < cents(min.weightKg)) min = p;
    if (max === null || cents(p.weightKg) > cents(max.weightKg)) max = p;
  }
  return {
    count: points.length,
    first: points[0] ?? null,
    last: points[points.length - 1] ?? null,
    min,
    max,
  };
}

/** 기록이 없는 날짜(오름차순). dailyLog 가 null 인 날 */
export function emptyDates(days: HistoryDay[]): string[] {
  return days.filter((d) => d.dailyLog === null).map((d) => d.recordDate);
}

export interface MemoDay {
  recordDate: string;
  /** 사용자가 적은 그대로 (가공·요약하지 않는다) */
  memo: string;
}

/** 메모가 있는 날(최신 날짜 먼저). 공백뿐인 메모는 뺀다 */
export function memoDays(days: HistoryDay[]): MemoDay[] {
  return days
    .filter((d) => d.dailyLog !== null && d.dailyLog.memo.trim() !== '')
    .map((d) => ({ recordDate: d.recordDate, memo: d.dailyLog!.memo }))
    .reverse();
}

/** 앞에서 limit 건만 보여 주고 나머지 건수를 알려 준다 (조용히 자르지 않기 위함) */
export function limitItems<T>(items: T[], limit: number = REPORT_LIST_LIMIT): { shown: T[]; rest: number } {
  return items.length <= limit ? { shown: items, rest: 0 } : { shown: items.slice(0, limit), rest: items.length - limit };
}
