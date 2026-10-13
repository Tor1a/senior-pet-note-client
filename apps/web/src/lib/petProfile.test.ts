import { describe, expect, it } from 'vitest';
import { compareYmd, daysInMonth, dayOptions, isLeapYear, isRealDate, parseIsoDate, todayParts, toIsoDate } from './petProfile';

describe('날짜 계산(순수)', () => {
  it('윤년: 4로 나뉘면 윤년, 100은 아님, 400은 윤년', () => {
    expect([2024, 2000].every(isLeapYear)).toBe(true);
    expect([2023, 1900, 2100].some(isLeapYear)).toBe(false);
  });

  it('daysInMonth: 2월은 윤년 29/아니면 28, 연도를 모르면 29, 4·6·9·11월 30', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(null, 2)).toBe(29);
    expect([4, 6, 9, 11].map((m) => daysInMonth(2025, m))).toEqual([30, 30, 30, 30]);
    expect([1, 3, 5, 7, 8, 10, 12].map((m) => daysInMonth(2025, m))).toEqual([31, 31, 31, 31, 31, 31, 31]);
  });

  it('dayOptions: 월을 모르면 1~31, 2월 비윤년은 1~28', () => {
    expect(dayOptions(2025, null)).toHaveLength(31);
    expect(dayOptions(2023, 2).at(-1)).toBe(28);
    expect(dayOptions(2024, 2).at(-1)).toBe(29);
  });

  it('isRealDate / toIsoDate / parseIsoDate', () => {
    expect(isRealDate(2025, 2, 30)).toBe(false);
    expect(isRealDate(2023, 2, 29)).toBe(false);
    expect(isRealDate(2024, 2, 29)).toBe(true);
    expect(toIsoDate(2015, 3, 2)).toBe('2015-03-02');
    expect(parseIsoDate('2015-03-02')).toEqual({ year: 2015, month: 3, day: 2 });
    expect(parseIsoDate('2025-02-30')).toBeNull();
    expect(parseIsoDate('2025/02/10')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });

  it('compareYmd, todayParts(기기 달력 날짜)', () => {
    expect(compareYmd({ year: 2025, month: 1, day: 1 }, { year: 2024, month: 12, day: 31 })).toBeGreaterThan(0);
    expect(compareYmd({ year: 2025, month: 1, day: 1 }, { year: 2025, month: 1, day: 1 })).toBe(0);
    expect(todayParts(new Date(2026, 9, 13, 2, 0))).toEqual({ year: 2026, month: 10, day: 13 });
    expect(todayParts(new Date(2026, 11, 31, 23, 59))).toEqual({ year: 2026, month: 12, day: 31 });
  });
});
