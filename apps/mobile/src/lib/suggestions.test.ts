// [공유 로직 테스트 사본] 원본: web/src/lib/suggestions.test.ts (vitest import 한 줄만 빼고 jest 전역 함수로 실행)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정.

import { suggestLevel, suggestNumber, type DayValue } from './suggestions';

const TODAY = '2026-10-06';

describe('suggestLevel — 단계형 제안값(최근 7일 평균, 반올림)', () => {
  it('기록이 없으면 null (빈칸)', () => {
    expect(suggestLevel([], TODAY)).toBeNull();
  });

  it('값이 모두 null 이면 null', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-05', value: null },
      { recordDate: '2026-10-04', value: undefined },
    ];
    expect(suggestLevel(logs, TODAY)).toBeNull();
  });

  it('오늘 기록은 제외한다', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-06', value: 3 },
      { recordDate: '2026-10-05', value: 1 },
    ];
    expect(suggestLevel(logs, TODAY)).toBe(1);
  });

  it('8일 전 이전 기록은 제외, 7일 전(09-29)은 포함', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-09-28', value: 3 }, // 8일 전: 제외
      { recordDate: '2026-09-29', value: 1 }, // 7일 전: 포함
    ];
    expect(suggestLevel(logs, TODAY)).toBe(1);
  });

  it('기록 있는 날만 평균: (2+3)/2 = 2.5 → 3 (반올림)', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-05', value: 2 },
      { recordDate: '2026-10-03', value: 3 },
      { recordDate: '2026-10-02', value: null }, // 안 적은 날은 평균에서 제외
    ];
    expect(suggestLevel(logs, TODAY)).toBe(3);
  });

  it('(1+2+2)/3 = 1.67 → 2', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-05', value: 1 },
      { recordDate: '2026-10-04', value: 2 },
      { recordDate: '2026-10-01', value: 2 },
    ];
    expect(suggestLevel(logs, TODAY)).toBe(2);
  });

  it('(1+1+2)/3 = 1.33 → 1', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-05', value: 1 },
      { recordDate: '2026-10-04', value: 1 },
      { recordDate: '2026-10-03', value: 2 },
    ];
    expect(suggestLevel(logs, TODAY)).toBe(1);
  });

  it('미래 날짜 기록은 제외', () => {
    expect(suggestLevel([{ recordDate: '2026-10-07', value: 3 }], TODAY)).toBeNull();
  });
});

describe('suggestNumber — 숫자형 제안값(체중·ml)', () => {
  it('기록이 없으면 null', () => {
    expect(suggestNumber([], TODAY)).toBeNull();
  });

  it('체중 평균, 소수 둘째 자리', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-05', value: 4.2 },
      { recordDate: '2026-10-02', value: 4.1 },
      { recordDate: '2026-09-30', value: 4.25 },
    ];
    expect(suggestNumber(logs, TODAY, 2)).toBe(4.18);
  });

  it('ml 는 정수로', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-05', value: 200 },
      { recordDate: '2026-10-04', value: 251 },
    ];
    expect(suggestNumber(logs, TODAY, 0)).toBe(226);
  });

  it('0 은 기록으로 인정한다(null 과 구분)', () => {
    const logs: DayValue[] = [
      { recordDate: '2026-10-05', value: 0 },
      { recordDate: '2026-10-04', value: 100 },
    ];
    expect(suggestNumber(logs, TODAY, 0)).toBe(50);
  });
});
