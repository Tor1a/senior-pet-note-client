// [공유 로직 테스트 사본] 원본: web/src/lib/symptoms.test.ts (vitest import 한 줄만 빼고 jest 전역 함수로 실행)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정.

import {
  INITIAL_SYMPTOM_STATE,
  toggleSymptom,
  toggleSymptomNone,
  toSymptomColumns,
} from './symptoms';

describe('증상 선택 상태 — "특이사항 없음" 기본 선택', () => {
  it('초기 상태는 특이사항 없음 선택, 증상 없음', () => {
    expect(INITIAL_SYMPTOM_STATE).toEqual({ none: true, codes: [], other: '' });
    expect(Object.isFrozen(INITIAL_SYMPTOM_STATE)).toBe(true);
  });

  it('증상을 고르면 특이사항 없음이 자동 해제된다', () => {
    const s = toggleSymptom({ ...INITIAL_SYMPTOM_STATE, codes: [] }, 'vomit');
    expect(s.none).toBe(false);
    expect(s.codes).toEqual(['vomit']);
  });

  it('특이사항 없음을 다시 고르면 증상이 지워진다', () => {
    const s = toggleSymptom({ none: false, codes: ['cough'], other: '' }, 'other');
    const cleared = toggleSymptomNone(s);
    expect(cleared).toEqual({ none: true, codes: [], other: '' });
  });

  it('저장 값: 초기 상태 그대로 저장하면 symptoms_none = true', () => {
    expect(toSymptomColumns({ ...INITIAL_SYMPTOM_STATE, codes: [] })).toEqual({
      symptoms: [],
      symptoms_none: true,
      symptom_other: null,
    });
  });

  it('저장 값: 기타 내용은 other 선택 시에만, 30자 제한', () => {
    const s = { none: false, codes: ['other' as const], other: '가'.repeat(40) };
    expect(toSymptomColumns(s).symptom_other).toHaveLength(30);
    expect(toSymptomColumns({ none: false, codes: ['vomit'], other: '무시됨' }).symptom_other).toBeNull();
  });
});
