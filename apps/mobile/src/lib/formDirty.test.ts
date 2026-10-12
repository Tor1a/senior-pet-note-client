// [공유 로직 테스트 사본] 원본: web/src/lib/formDirty.test.ts (2026-10-12 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import type { TodayResponse } from './petApi';
import { initialTodayForm, isFormDirty, tapLevel } from './todayForm';
import { toggleSymptom } from './symptoms';

function today(over: Partial<TodayResponse> = {}): TodayResponse {
  return {
    recordDate: '2026-10-12',
    cutoffNotice: '',
    doses: [],
    dailyLog: null,
    suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 },
    lastWeight: { weightKg: 4.4, recordDate: '2026-10-09' },
    ...over,
  };
}

describe('isFormDirty', () => {
  it('불러온 그대로(제안값 점선 포함)면 바뀐 것이 아니다', () => {
    const base = initialTodayForm(today());
    expect(isFormDirty(initialTodayForm(today()), base)).toBe(false);
  });

  it('탭으로 확정하거나 값을 바꾸면 바뀐 것이다', () => {
    const base = initialTodayForm(today());
    expect(isFormDirty({ ...base, food: tapLevel(base.food, 3) }, base)).toBe(true);
    expect(isFormDirty({ ...base, food: tapLevel(base.food, 2) }, base)).toBe(true); // 제안값을 확정
    expect(isFormDirty({ ...base, weight: { ...base.weight, text: '43', measured: true } }, base)).toBe(true);
    expect(isFormDirty({ ...base, symptoms: toggleSymptom(base.symptoms, 'cough') }, base)).toBe(true);
  });

  it('메모는 글자가 있으면 바뀐 것, 공백만이면 아니다', () => {
    const base = initialTodayForm(today());
    expect(isFormDirty({ ...base, memo: '  ' }, base)).toBe(false);
    expect(isFormDirty({ ...base, memo: '산책' }, base)).toBe(true);
  });

  it('바꿨다가 원래대로 돌려놓으면 바뀐 것이 아니고, 물 입력 방식만 바꾼 것도 아니다', () => {
    const base = initialTodayForm(today());
    const changed = { ...base, memo: '가' };
    expect(isFormDirty({ ...changed, memo: '' }, base)).toBe(false);
    expect(isFormDirty({ ...base, waterMode: 'ml' }, base)).toBe(false);
  });

  it('저장된 기록이 기준선이면 같은 값은 바뀐 것이 아니다', () => {
    const log = {
      id: 'l', petId: 'p', recordDate: '2026-10-12', foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.3,
      symptoms: [], symptomsNone: true, symptomOther: null, memo: '메모', updatedAt: 'x',
    } as const;
    const base = initialTodayForm(today({ dailyLog: { ...log, symptoms: [] } }));
    expect(isFormDirty(initialTodayForm(today({ dailyLog: { ...log, symptoms: [] } })), base)).toBe(false);
    expect(isFormDirty({ ...base, memo: '메모 수정' }, base)).toBe(true);
  });
});
