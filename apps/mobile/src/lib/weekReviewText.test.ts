// [공유 로직 테스트 사본] 원본: web/src/lib/weekReviewText.test.ts (2026-10-15 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄을 제거하고 expect(값, 메시지) 의 메시지 인자 2곳을 뺐다(jest 타입에 없음). 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
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
      expect(findWeekReviewForbidden(text)).toBeNull();
    }
  });
  it('퍼센트·일째·평균이 없다', () => {
    for (const text of weekReviewTexts()) expect(text).not.toMatch(/%|일째|평균/);
  });
  it('기본 금지어와 추가 금지어를 잡는다', () => {
    expect(findWeekReviewForbidden('정상이에요')).toBe('정상');
    expect(findWeekReviewForbidden('90%')).toBe('%');
    for (const word of ['연속 기록', '목표 달성', '꾸준히', '지난주보다', '평균', '3일째', '계속', '해야 해요']) {
      expect(findWeekReviewForbidden(word)).not.toBeNull();
    }
  });
});
