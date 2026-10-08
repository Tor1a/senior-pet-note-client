// [공유 로직 테스트 사본] 원본: web/src/lib/reportStats.test.ts (2026-10-08 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { daysFixture } from './historyFixtures';
import { lastNDays, levelCounts, medicationTotals, recordedDayCount } from './historyStats';
import {
  DEFAULT_REPORT_RANGE,
  emptyDates,
  limitItems,
  memoDays,
  parseReportRange,
  reportDays,
  weightExtremes,
} from './reportStats';

const END = '2026-10-08';

describe('weightExtremes', () => {
  it('빈 days: 모두 비어 있다', () => {
    expect(weightExtremes([])).toEqual({ count: 0, first: null, last: null, min: null, max: null });
  });

  it('기록 0일(체중 없음)', () => {
    const ex = weightExtremes(daysFixture(END, 14, {}));
    expect(ex.count).toBe(0);
    expect(ex.min).toBeNull();
  });

  it('체중 1개: 첫=마지막=최소=최대', () => {
    const ex = weightExtremes(daysFixture(END, 14, { '2026-10-05': { weightKg: 4.2 } }));
    expect(ex.count).toBe(1);
    expect(ex.first?.recordDate).toBe('2026-10-05');
    expect(ex.last).toEqual(ex.first);
    expect(ex.min).toEqual(ex.first);
    expect(ex.max).toEqual(ex.first);
  });

  it('첫·마지막·최소·최대와 날짜', () => {
    const days = daysFixture(END, 14, {
      '2026-09-26': { weightKg: 4.4 },
      '2026-10-03': { weightKg: 4.0 },
      '2026-10-05': { weightKg: 4.3 },
      '2026-10-08': { weightKg: 4.1 },
    });
    const ex = weightExtremes(days);
    expect(ex.count).toBe(4);
    expect([ex.first?.weightKg, ex.first?.recordDate]).toEqual([4.4, '2026-09-26']);
    expect([ex.last?.weightKg, ex.last?.recordDate]).toEqual([4.1, '2026-10-08']);
    expect([ex.min?.weightKg, ex.min?.recordDate]).toEqual([4.0, '2026-10-03']);
    expect([ex.max?.weightKg, ex.max?.recordDate]).toEqual([4.4, '2026-09-26']);
  });

  it('모두 같은 값이면 최소·최대는 가장 이른 날', () => {
    const days = daysFixture(END, 14, {
      '2026-10-02': { weightKg: 5 },
      '2026-10-04': { weightKg: 5 },
      '2026-10-06': { weightKg: 5 },
    });
    const ex = weightExtremes(days);
    expect(ex.min?.recordDate).toBe('2026-10-02');
    expect(ex.max?.recordDate).toBe('2026-10-02');
    expect(ex.last?.recordDate).toBe('2026-10-06');
  });

  it('소수 부동오차: 0.1+0.2 와 0.3 은 같은 값으로 본다', () => {
    const days = daysFixture(END, 7, {
      '2026-10-03': { weightKg: 0.1 + 0.2 },
      '2026-10-05': { weightKg: 0.3 },
    });
    const ex = weightExtremes(days);
    expect(ex.min?.recordDate).toBe('2026-10-03');
    expect(ex.max?.recordDate).toBe('2026-10-03');
  });
});

describe('emptyDates / memoDays', () => {
  const days = daysFixture(END, 5, {
    '2026-10-05': { memo: '첫 메모' },
    '2026-10-06': { memo: '   ' },
    '2026-10-08': { memo: '줄바꿈\n그대로' },
  });

  it('기록 없는 날짜는 오름차순', () => {
    expect(emptyDates(days)).toEqual(['2026-10-04', '2026-10-07']);
    expect(emptyDates([])).toEqual([]);
  });

  it('메모는 최신이 위, 공백뿐인 메모는 뺀다, 내용은 그대로', () => {
    expect(memoDays(days)).toEqual([
      { recordDate: '2026-10-08', memo: '줄바꿈\n그대로' },
      { recordDate: '2026-10-05', memo: '첫 메모' },
    ]);
  });
});

describe('기간 자르기', () => {
  const thirty = daysFixture(END, 30, { '2026-10-08': { weightKg: 4 }, '2026-09-20': { weightKg: 5 } });

  it('parseReportRange: 7/14/30 만 받고 나머지는 14', () => {
    expect(parseReportRange('7')).toBe(7);
    expect(parseReportRange('30')).toBe(30);
    expect(parseReportRange(14)).toBe(14);
    expect(parseReportRange('90')).toBe(DEFAULT_REPORT_RANGE);
    expect(parseReportRange(null)).toBe(14);
    expect(parseReportRange('abc')).toBe(14);
  });

  it('7/14/30 이 historyStats.lastNDays 와 같은 결과다', () => {
    for (const r of [7, 14, 30] as const) {
      expect(reportDays(thirty, r)).toEqual(lastNDays(thirty, r));
      expect(reportDays(thirty, r)).toHaveLength(r);
    }
    expect(reportDays(thirty, 14)[13].recordDate).toBe(END);
  });

  it('받은 days 가 기간보다 짧으면 그대로', () => {
    expect(reportDays(daysFixture(END, 3), 14)).toHaveLength(3);
    expect(reportDays([], 14)).toEqual([]);
  });

  it('14일 자르기: 체중 첫 기록은 14일 안에서만, 이전 값은 빠진다', () => {
    const ex = weightExtremes(reportDays(thirty, 14));
    expect(ex.count).toBe(1);
    expect(ex.first?.recordDate).toBe(END);
  });

  it('지난 기록과 같은 함수를 쓰므로 합계가 어긋나지 않는다', () => {
    const days = daysFixture(END, 30, { '2026-10-08': { foodLevel: 2 } }, {}, { scheduledCount: 3, takenCount: 2 });
    const cut = reportDays(days, 14);
    expect(recordedDayCount(cut)).toBe(1);
    expect(levelCounts(cut, 'foodLevel')[2]).toBe(1);
    expect(medicationTotals(cut)).toEqual({ scheduled: 42, taken: 28 });
  });
});

describe('limitItems', () => {
  it('12건 이하는 그대로, 초과면 나머지 건수', () => {
    expect(limitItems([1, 2, 3])).toEqual({ shown: [1, 2, 3], rest: 0 });
    const twelve = Array.from({ length: 12 }, (_, i) => i);
    expect(limitItems(twelve).rest).toBe(0);
    const fifteen = Array.from({ length: 15 }, (_, i) => i);
    const r = limitItems(fifteen);
    expect(r.shown).toHaveLength(12);
    expect(r.rest).toBe(3);
  });
});
