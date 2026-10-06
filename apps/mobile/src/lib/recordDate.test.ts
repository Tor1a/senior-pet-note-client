// [공유 로직 테스트 사본] 원본: web/src/lib/recordDate.test.ts (vitest import 한 줄만 빼고 jest 전역 함수로 실행)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정.

import { RECORD_DATE_NOTICE, RECORD_DAY_CUTOFF_HOUR } from './constants';
import { addDays, toRecordDate } from './recordDate';

// 한국 시각(KST, UTC+9)으로 Date 를 만든다. 테스트 실행 PC 의 시간대와 무관하다.
const kst = (iso: string) => new Date(`${iso}+09:00`);

describe('toRecordDate — 새벽 4시 기준 기록 날짜 (Asia/Seoul)', () => {
  it('규칙 상수와 안내 문구', () => {
    expect(RECORD_DAY_CUTOFF_HOUR).toBe(4);
    expect(RECORD_DATE_NOTICE).toBe('새벽 4시 전 투약은 전날 기록으로 저장돼요');
  });

  it('00:00 체크는 전날', () => {
    expect(toRecordDate(kst('2026-10-07T00:00:00'))).toBe('2026-10-06');
  });

  it('03:59 체크는 전날 (03:59:59.999 포함)', () => {
    expect(toRecordDate(kst('2026-10-07T03:59:00'))).toBe('2026-10-06');
    expect(toRecordDate(kst('2026-10-07T03:59:59.999'))).toBe('2026-10-06');
  });

  it('04:00 체크는 당일', () => {
    expect(toRecordDate(kst('2026-10-07T04:00:00'))).toBe('2026-10-07');
  });

  it('23:59 체크는 당일', () => {
    expect(toRecordDate(kst('2026-10-06T23:59:00'))).toBe('2026-10-06');
  });

  it('낮 시간은 당일', () => {
    expect(toRecordDate(kst('2026-10-06T08:02:00'))).toBe('2026-10-06');
  });

  it('월·연 경계: 1월 1일 새벽 2시 → 전년 12월 31일', () => {
    expect(toRecordDate(kst('2027-01-01T02:00:00'))).toBe('2026-12-31');
    expect(toRecordDate(kst('2026-03-01T01:00:00'))).toBe('2026-02-28');
  });

  it('UTC 로 들어온 시각도 한국 시각으로 판단한다', () => {
    // 2026-10-06T18:30Z = 한국 10월 7일 03:30 → 전날(10월 6일)
    expect(toRecordDate(new Date('2026-10-06T18:30:00Z'))).toBe('2026-10-06');
    // 2026-10-06T19:00Z = 한국 10월 7일 04:00 → 당일
    expect(toRecordDate(new Date('2026-10-06T19:00:00Z'))).toBe('2026-10-07');
  });

  it('잘못된 날짜는 오류', () => {
    expect(() => toRecordDate(new Date('invalid'))).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('월·연 경계를 넘는다', () => {
    expect(addDays('2026-10-06', -7)).toBe('2026-09-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});
