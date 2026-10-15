import { describe, expect, it } from 'vitest';
import {
  findWeekReviewForbidden,
  WEEK_REVIEW_TEXT,
  weekMedicationSr,
  weekMedicationText,
  weekRangeSr,
  weekRangeText,
  weekRecordedSr,
  weekRecordedText,
  weekReviewTexts,
  weekWeightFirst,
  weekWeightLast,
  weekWeightTitle,
  weekWeightValue,
} from './weekReviewText';

describe('weekReviewText 조립', () => {
  it('기본값 문구', () => {
    expect(WEEK_REVIEW_TEXT.title).toBe('최근 7일 돌아보기');
    expect(weekRangeText('2026-10-02', '2026-10-08')).toBe('10월 2일 ~ 10월 8일');
    expect(weekRangeSr('2026-10-02', '2026-10-08')).toBe('10월 2일부터 10월 8일까지');
    expect(weekRecordedText(4, 7)).toBe('기록한 날 4일 / 7일');
    expect(weekRecordedSr(4, 7)).toBe('기록한 날 7일 중 4일');
    expect(weekWeightTitle(3)).toBe('체중 기록 3번');
    expect(weekWeightFirst(4.4, '2026-10-02')).toBe('첫 기록 4.4kg (10월 2일)');
    expect(weekWeightLast(4.1, '2026-10-08')).toBe('마지막 4.1kg (10월 8일)');
    expect(weekWeightValue(4.1, '2026-10-08')).toBe('4.1kg (10월 8일)');
    expect(weekMedicationText(12, 14)).toBe('투약 체크 12/14회');
    expect(weekMedicationSr(12, 14)).toBe('투약 체크 14회 중 12회');
  });
});

describe('findWeekReviewForbidden', () => {
  it('문구 상수·조립 출력 전부 금지어 0건', () => {
    for (const text of weekReviewTexts()) {
      expect(findWeekReviewForbidden(text), text).toBeNull();
    }
  });
  it('퍼센트·일째·평균이 없다', () => {
    for (const text of weekReviewTexts()) expect(text).not.toMatch(/%|일째|평균/);
  });
  it('기본 금지어와 추가 금지어를 잡는다', () => {
    expect(findWeekReviewForbidden('정상이에요')).toBe('정상');
    expect(findWeekReviewForbidden('90%')).toBe('%');
    for (const word of ['연속 기록', '목표 달성', '꾸준히', '지난주보다', '평균', '3일째', '계속', '해야 해요']) {
      expect(findWeekReviewForbidden(word), word).not.toBeNull();
    }
  });
});
