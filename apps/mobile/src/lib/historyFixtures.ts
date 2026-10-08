// [공유 로직 사본] 원본: web/src/lib/historyFixtures.ts (2026-10-08 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 지난 기록 테스트용 가짜 데이터 (계약 예시 docs/api-history.md 와 같은 모양)
import { addDays } from './format';
import type { DailyLog, HistoryDay, HistoryResponse } from './petApi';

export function logFixture(recordDate: string, overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    id: `log-${recordDate}`,
    petId: 'pet-1',
    recordDate,
    foodLevel: null,
    waterLevel: null,
    waterMl: null,
    weightKg: null,
    symptoms: [],
    symptomsNone: false,
    symptomOther: null,
    memo: '',
    updatedAt: `${recordDate}T13:20:00Z`,
    ...overrides,
  };
}

/** end 날짜까지 count 일을 오름차순으로 만든다. logs 는 날짜별 기록(없으면 dailyLog null) */
export function daysFixture(
  end: string,
  count: number,
  logs: Record<string, Partial<DailyLog>> = {},
  medication: Record<string, { scheduledCount: number; takenCount: number }> = {},
  defaultMedication = { scheduledCount: 0, takenCount: 0 },
): HistoryDay[] {
  return Array.from({ length: count }, (_, i) => {
    const recordDate = addDays(end, i - (count - 1));
    return {
      recordDate,
      dailyLog: recordDate in logs ? logFixture(recordDate, logs[recordDate]) : null,
      medication: medication[recordDate] ?? defaultMedication,
    };
  });
}

export function historyFixture(days: HistoryDay[], overrides: Partial<HistoryResponse> = {}): HistoryResponse {
  return {
    petId: 'pet-1',
    from: days[0]?.recordDate ?? '2026-10-08',
    to: days[days.length - 1]?.recordDate ?? '2026-10-08',
    recordDate: days[days.length - 1]?.recordDate ?? '2026-10-08',
    medicationBasis: 'current',
    days,
    ...overrides,
  };
}
