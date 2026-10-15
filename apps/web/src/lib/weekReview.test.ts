import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { daysFixture } from './historyFixtures';
import { lastNDays, medicationTotals, recordedDayCount, weightPoints } from './historyStats';
import { weekReviewView, type WeekReviewFacts } from './weekReview';

const END = '2026-10-08';

function facts(view: ReturnType<typeof weekReviewView>): WeekReviewFacts {
  if (!view || view.kind !== 'facts') throw new Error('facts 가 아니에요');
  return view;
}

describe('weekReviewView', () => {
  it('30일 중 마지막 7일만 센다(기간·기록한 날·체중·투약)', () => {
    const days = daysFixture(
      END,
      30,
      {
        '2026-09-10': { weightKg: 5 }, // 7일 밖
        '2026-10-02': { weightKg: 4.4 },
        '2026-10-05': { foodLevel: 2 },
        '2026-10-06': { weightKg: 4.3 },
        '2026-10-08': { weightKg: 4.1 },
      },
      {},
      { scheduledCount: 2, takenCount: 1 },
    );
    const view = facts(weekReviewView(days));
    expect(view.firstDate).toBe('2026-10-02');
    expect(view.lastDate).toBe('2026-10-08');
    expect(view.recorded).toBe(4);
    expect(view.total).toBe(7);
    expect(view.weight).toEqual({
      count: 3,
      first: { weightKg: 4.4, recordDate: '2026-10-02' },
      last: { weightKg: 4.1, recordDate: '2026-10-08' },
    });
    expect(view.medication).toEqual({ taken: 7, scheduled: 14 });
  });

  it('지난 기록 7일 보기와 같은 함수 결과와 숫자가 일치한다', () => {
    const days = daysFixture(
      END,
      30,
      { '2026-10-03': { weightKg: 4.4 }, '2026-10-04': { walkCount: 2 }, '2026-10-08': { weightKg: 4.2 }, '2026-09-20': { weightKg: 9 } },
      { '2026-10-03': { scheduledCount: 3, takenCount: 3 } },
      { scheduledCount: 1, takenCount: 0 },
    );
    const last7 = lastNDays(days, 7);
    const view = facts(weekReviewView(days));
    expect(view.recorded).toBe(recordedDayCount(last7));
    expect(view.total).toBe(last7.length);
    expect(view.weight?.count).toBe(weightPoints(last7).length);
    expect(view.medication).toEqual(medicationTotals(last7));
  });

  it('산책·배변만 저장한 날도 기록한 날로 센다', () => {
    const days = daysFixture(END, 30, { '2026-10-07': { walkCount: 1, poopCount: 0 } });
    const view = facts(weekReviewView(days));
    expect(view.recorded).toBe(1);
    expect(view.weight).toBeNull();
    expect(view.medication).toBeNull();
  });

  it('투약 체크만 있고 기록이 없는 날은 기록한 날에 안 센다(0일이면 empty)', () => {
    const days = daysFixture(END, 30, {}, {}, { scheduledCount: 2, takenCount: 2 });
    expect(weekReviewView(days)).toEqual({ kind: 'empty', firstDate: '2026-10-02', lastDate: END });
  });

  it('예전 기록만 있고 7일에는 없으면 empty', () => {
    const days = daysFixture(END, 30, { '2026-09-15': { weightKg: 4.5 } });
    expect(weekReviewView(days)?.kind).toBe('empty');
  });

  it('체중 1번이면 first 와 last 가 같다', () => {
    const days = daysFixture(END, 30, { '2026-10-08': { weightKg: 4.1 } });
    const w = facts(weekReviewView(days)).weight;
    expect(w?.count).toBe(1);
    expect(w?.first).toEqual(w?.last);
  });

  it('같은 값 두 번도 그대로 둔다(증감 없음)', () => {
    const days = daysFixture(END, 30, { '2026-10-02': { weightKg: 4.4 }, '2026-10-08': { weightKg: 4.4 } });
    const w = facts(weekReviewView(days)).weight;
    expect(w?.count).toBe(2);
    expect(w?.first.weightKg).toBe(4.4);
    expect(w?.last.weightKg).toBe(4.4);
  });

  it('7일 경계: 첫 날(10-02)과 마지막 날(10-08)은 포함, 그 전날(10-01)은 제외', () => {
    const days = daysFixture(END, 30, { '2026-10-01': { weightKg: 9 }, '2026-10-02': { weightKg: 4.4 }, '2026-10-08': { weightKg: 4.1 } });
    const view = facts(weekReviewView(days));
    expect(view.weight?.count).toBe(2);
    expect(view.weight?.first.recordDate).toBe('2026-10-02');
  });

  it('7개 미만이면 분모는 받은 날 수', () => {
    const view = facts(weekReviewView(daysFixture(END, 3, { '2026-10-08': { weightKg: 4 } })));
    expect(view.total).toBe(3);
    expect(view.firstDate).toBe('2026-10-06');
  });

  it('days 가 비면 null', () => {
    expect(weekReviewView([])).toBeNull();
  });

  it('소스에 클라이언트 날짜 계산이 없다', () => {
    for (const file of ['./weekReview.ts', './weekReviewText.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src).not.toMatch(/new Date|Date\.now|seoulDateString|addDays|daysBetween/);
    }
  });
});
