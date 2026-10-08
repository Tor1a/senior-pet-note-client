// 지난 기록 화면의 표시용 집계 (평균·개수 세기만. 기록 날짜·제안값 계산은 하지 않는다)
// 서버(docs/api-history.md)가 준 days 를 그대로 받아 센다. 평가·판정은 하지 않는다.
import { addDays } from './format';
import type { HistoryDay } from './petApi';
import type { SymptomCode } from './symptoms';

/** 화면에 보여 주는 기간(일). 서버는 30일치를 주고 7일은 뒤에서 7개를 자른다 */
export type HistoryRange = 7 | 30;

/** 받은 days(오름차순) 의 마지막 n개 */
export function lastNDays(days: HistoryDay[], n: number): HistoryDay[] {
  return days.length <= n ? days : days.slice(days.length - n);
}

/** 그날 기록이 있는가 */
export function hasLog(day: HistoryDay): boolean {
  return day.dailyLog !== null;
}

/** 기록한 날 수 (dailyLog 가 있는 날) */
export function recordedDayCount(days: HistoryDay[]): number {
  return days.filter(hasLog).length;
}

export interface WeightPoint {
  /** days 안에서의 위치(0 부터) */
  index: number;
  recordDate: string;
  weightKg: number;
}

/** 체중이 있는 날만, 오름차순 */
export function weightPoints(days: HistoryDay[]): WeightPoint[] {
  const points: WeightPoint[] = [];
  days.forEach((day, index) => {
    const kg = day.dailyLog?.weightKg;
    if (typeof kg === 'number') points.push({ index, recordDate: day.recordDate, weightKg: kg });
  });
  return points;
}

export type WeightCompare = 'less' | 'more' | 'same';

export interface WeightFact {
  /** 체중을 적은 날 수 */
  count: number;
  first: WeightPoint | null;
  last: WeightPoint | null;
  /** 마지막 체중일 이전 7일의 평균(소수 둘째 자리, HALF_UP). 비교할 값이 없으면 null */
  previousAverage: number | null;
  /** |마지막 − 직전 7일 평균| (소수 둘째 자리). previousAverage 가 null 이면 null */
  difference: number | null;
  compare: WeightCompare | null;
}

/** 센트(1/100 kg) 단위 정수로 바꾼다 (부동소수 오차 방지) */
function toCents(kg: number): number {
  return Math.round(kg * 100);
}

/**
 * 체중 사실 요약. 직전 7일 비교는 체중 기록이 2번 이상이고, 마지막 체중일 이전 7일
 * (마지막 날 −7 ~ −1) 안에 체중을 적은 날이 1개 이상일 때만 만든다.
 * context: 평균 계산에 쓰는 전체 days(서버가 준 30일). 7일 보기에서도 "직전 7일"이 잘리지 않게 한다.
 * 개수·처음·마지막은 화면에 보이는 days 기준이고, 생략하면 days 로 평균도 계산한다.
 */
export function weightFact(days: HistoryDay[], context: HistoryDay[] = days): WeightFact {
  const points = weightPoints(days);
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;
  const empty = { count: points.length, first, last, previousAverage: null, difference: null, compare: null };
  if (points.length < 2 || !last) return empty;

  const windowStart = addDays(last.recordDate, -7);
  const windowEnd = addDays(last.recordDate, -1);
  const prior = weightPoints(context).filter((p) => p.recordDate >= windowStart && p.recordDate <= windowEnd);
  if (prior.length === 0) return empty;

  const sum = prior.reduce((acc, p) => acc + toCents(p.weightKg), 0);
  const n = prior.length;
  const avgCents = Math.floor((2 * sum + n) / (2 * n)); // HALF_UP
  const diffCents = toCents(last.weightKg) - avgCents;
  return {
    count: points.length,
    first,
    last,
    previousAverage: avgCents / 100,
    difference: Math.abs(diffCents) / 100,
    compare: diffCents < 0 ? 'less' : diffCents > 0 ? 'more' : 'same',
  };
}

export interface LevelCounts {
  1: number;
  2: number;
  3: number;
  /** 단계를 안 적은 날 (기록이 없는 날 포함) */
  none: number;
}

/** 식사/물 단계별 일수. 물은 ml 로만 적은 날을 'none' 에 넣지 않고 따로 센다 */
export function levelCounts(days: HistoryDay[], field: 'foodLevel' | 'waterLevel'): LevelCounts {
  const counts: LevelCounts = { 1: 0, 2: 0, 3: 0, none: 0 };
  for (const day of days) {
    const level = day.dailyLog?.[field];
    if (level === 1 || level === 2 || level === 3) counts[level] += 1;
    else counts.none += 1;
  }
  return counts;
}

/** ml 로 적은 날의 평균(정수 반올림)과 그 날 수. 없으면 null */
export function waterMlAverage(days: HistoryDay[]): { average: number; count: number } | null {
  const values = days.flatMap((d) => (typeof d.dailyLog?.waterMl === 'number' ? [d.dailyLog.waterMl] : []));
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return { average: Math.floor((2 * sum + values.length) / (2 * values.length)), count: values.length };
}

export interface SymptomDay {
  recordDate: string;
  codes: SymptomCode[];
  other: string | null;
}

/** 증상을 적은 날(최신 날짜 먼저) */
export function symptomDays(days: HistoryDay[]): SymptomDay[] {
  return days
    .filter((d) => d.dailyLog && d.dailyLog.symptoms.length > 0)
    .map((d) => ({
      recordDate: d.recordDate,
      codes: d.dailyLog!.symptoms,
      other: d.dailyLog!.symptomOther,
    }))
    .reverse();
}

/** "특이사항 없음"으로 적은 날 수 */
export function symptomNoneCount(days: HistoryDay[]): number {
  return days.filter((d) => d.dailyLog?.symptomsNone && d.dailyLog.symptoms.length === 0).length;
}

/** 투약 체크 합계 (현재 등록된 약 기준 환산값) */
export function medicationTotals(days: HistoryDay[]): { scheduled: number; taken: number } {
  return days.reduce(
    (acc, d) => ({
      scheduled: acc.scheduled + d.medication.scheduledCount,
      taken: acc.taken + d.medication.takenCount,
    }),
    { scheduled: 0, taken: 0 },
  );
}

/** 'YYYY-MM-DD' 이고 실제 있는 날짜인가 (주소의 날짜 검사용. 달력 문자열만 다룬다) */
export function isValidRecordDate(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}
