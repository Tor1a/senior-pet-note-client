import { describe, expect, it } from 'vitest';
import { daysFixture } from './historyFixtures';
import {
  isValidRecordDate,
  lastNDays,
  levelCounts,
  medicationTotals,
  recordedDayCount,
  symptomDays,
  symptomNoneCount,
  waterMlAverage,
  weightFact,
  weightPoints,
} from './historyStats';

const END = '2026-10-08';

describe('lastNDays', () => {
  it('뒤에서 n개를 자르고, 모자라면 그대로 돌려준다', () => {
    const days = daysFixture(END, 30);
    expect(lastNDays(days, 7)).toHaveLength(7);
    expect(lastNDays(days, 7)[6].recordDate).toBe(END);
    expect(lastNDays(days, 7)[0].recordDate).toBe('2026-10-02');
    expect(lastNDays(daysFixture(END, 3), 7)).toHaveLength(3);
    expect(lastNDays([], 7)).toEqual([]);
  });
});

describe('기록한 날·체중 점', () => {
  it('빈 배열', () => {
    expect(recordedDayCount([])).toBe(0);
    expect(weightPoints([])).toEqual([]);
    expect(weightFact([])).toMatchObject({ count: 0, first: null, last: null, compare: null });
  });

  it('체중 없는 기록은 점이 아니고, 기록한 날에는 센다', () => {
    const days = daysFixture(END, 7, { '2026-10-06': { foodLevel: 2 }, '2026-10-07': { weightKg: 4.4 } });
    expect(recordedDayCount(days)).toBe(2);
    expect(weightPoints(days)).toEqual([{ index: 5, recordDate: '2026-10-07', weightKg: 4.4 }]);
  });
});

describe('weightFact (직전 7일 평균 비교)', () => {
  it('직전 7일 평균보다 적으면 less, 평균은 소수 둘째 자리', () => {
    const days = daysFixture(END, 14, {
      '2026-10-02': { weightKg: 4.4 },
      '2026-10-05': { weightKg: 4.5 },
      '2026-10-08': { weightKg: 4.1 },
    });
    const fact = weightFact(days);
    expect(fact.count).toBe(3);
    expect(fact.previousAverage).toBe(4.45);
    expect(fact.difference).toBe(0.35);
    expect(fact.compare).toBe('less');
  });

  it('평균은 HALF_UP (4.285 → 4.29)', () => {
    const days = daysFixture(END, 14, {
      '2026-10-03': { weightKg: 4.28 },
      '2026-10-04': { weightKg: 4.29 },
      '2026-10-08': { weightKg: 4.4 },
    });
    expect(weightFact(days).previousAverage).toBe(4.29);
  });

  it('많으면 more, 같으면 same', () => {
    const more = daysFixture(END, 10, { '2026-10-05': { weightKg: 4 }, '2026-10-08': { weightKg: 4.3 } });
    expect(weightFact(more)).toMatchObject({ compare: 'more', difference: 0.3 });
    const same = daysFixture(END, 10, { '2026-10-05': { weightKg: 4 }, '2026-10-08': { weightKg: 4 } });
    expect(weightFact(same)).toMatchObject({ compare: 'same', difference: 0 });
  });

  it('직전 7일에 값이 없으면 비교하지 않는다 / 체중 1번이면 비교하지 않는다', () => {
    const far = daysFixture(END, 30, { '2026-09-20': { weightKg: 4 }, '2026-10-08': { weightKg: 4.3 } });
    expect(weightFact(far)).toMatchObject({ count: 2, previousAverage: null, compare: null });
    const one = daysFixture(END, 7, { '2026-10-08': { weightKg: 4.3 } });
    expect(weightFact(one)).toMatchObject({ count: 1, previousAverage: null });
  });

  it('마지막 체중일 −7일은 포함, −8일은 제외', () => {
    const days = daysFixture(END, 14, {
      '2026-10-01': { weightKg: 3 },
      '2026-09-30': { weightKg: 9 },
      '2026-10-08': { weightKg: 3 },
    });
    expect(weightFact(days).previousAverage).toBe(3);
  });
});

describe('식사·물·증상·투약 집계', () => {
  const days = daysFixture(
    END,
    7,
    {
      '2026-10-02': { foodLevel: 1, waterLevel: 2, symptoms: ['vomit'], symptomsNone: false },
      '2026-10-03': { foodLevel: 2, waterMl: 300, symptomsNone: true },
      '2026-10-04': { foodLevel: 2, waterMl: 205, symptoms: ['other', 'cough'], symptomOther: '절뚝' },
      '2026-10-06': { foodLevel: 3 },
    },
    { '2026-10-02': { scheduledCount: 2, takenCount: 1 }, '2026-10-03': { scheduledCount: 2, takenCount: 2 } },
  );

  it('단계별 일수와 안 적은 날', () => {
    expect(levelCounts(days, 'foodLevel')).toEqual({ 1: 1, 2: 2, 3: 1, none: 3 });
    expect(levelCounts(days, 'waterLevel')).toEqual({ 1: 0, 2: 1, 3: 0, none: 6 });
  });

  it('물 ml 평균은 정수 반올림, ml 이 없으면 null', () => {
    expect(waterMlAverage(days)).toEqual({ average: 253, count: 2 });
    expect(waterMlAverage([])).toBeNull();
  });

  it('증상을 적은 날은 최신 먼저, 특이사항 없음은 따로 센다', () => {
    expect(symptomDays(days).map((d) => d.recordDate)).toEqual(['2026-10-04', '2026-10-02']);
    expect(symptomDays(days)[0]).toMatchObject({ codes: ['other', 'cough'], other: '절뚝' });
    expect(symptomNoneCount(days)).toBe(1);
  });

  it('투약 합계', () => {
    expect(medicationTotals(days)).toEqual({ scheduled: 4, taken: 3 });
    expect(medicationTotals([])).toEqual({ scheduled: 0, taken: 0 });
  });
});

describe('isValidRecordDate', () => {
  it('형식과 실제 날짜를 모두 확인한다', () => {
    expect(isValidRecordDate('2026-10-08')).toBe(true);
    expect(isValidRecordDate('2024-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', 'abc', '', undefined, null]) {
      expect(isValidRecordDate(bad)).toBe(false);
    }
  });
});

describe('weightFact 의 평균 창 (7일 보기)', () => {
  const END = '2026-10-08';
  const all = daysFixture(END, 30, {
    '2026-10-01': { weightKg: 4 },
    '2026-10-02': { weightKg: 4.2 },
    '2026-10-08': { weightKg: 4.3 },
  });
  it('7일 보기에서 마지막 날 직전 7일이 보기 밖으로 걸쳐도 전체 days 로 평균을 낸다', () => {
    const visible = lastNDays(all, 7); // 10/2 ~ 10/8: 10/1 은 보기 밖
    expect(weightFact(visible).previousAverage).toBe(4.2); // context 없으면 보이는 값만
    const fact = weightFact(visible, all);
    expect(fact.previousAverage).toBe(4.1);
    expect(fact.count).toBe(2); // 개수는 보이는 기간 기준
  });
  it('보기 밖 값이 창(−7일) 바깥이면 평균에 들어가지 않는다', () => {
    const logs = { '2026-09-30': { weightKg: 9 }, '2026-10-02': { weightKg: 4.2 }, '2026-10-08': { weightKg: 4.3 } };
    const d = daysFixture(END, 30, logs);
    expect(weightFact(lastNDays(d, 7), d).previousAverage).toBe(4.2);
  });
});
