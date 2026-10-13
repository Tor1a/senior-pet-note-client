// [공유 로직 테스트 사본] 원본: web/src/lib/routineText.test.ts (2026-10-13 복사)
// 웹 원본에서 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import {
  findRoutineForbidden,
  ROUTINE_TEXT,
  routineButtonLabel,
  routineLiveText,
  routineSummary,
  routineTexts,
  routineToggleLabel,
  routineValueText,
  undoRoutineSentence,
} from './routineText';

describe('루틴 문구', () => {
  it('고정 문구·조립 출력(0·20 경계, 접근성 라벨) 전부가 금지 표현 검사를 통과한다', () => {
    const texts = routineTexts();
    expect(texts.length).toBeGreaterThan(60);
    for (const text of texts) expect({ text, hit: findRoutineForbidden(text) }).toEqual({ text, hit: null });
  });

  it('도움말에 권장·평가 표현이 없다', () => {
    expect(ROUTINE_TEXT.help).toBe('적은 값만 저장돼요. 배변은 대변을 본 횟수예요.');
    expect(ROUTINE_TEXT.limitReached).toBe('20회까지 적을 수 있어요.');
  });

  it('요약: 둘 다 / 한쪽만 / 0 / 둘 다 없음(null)', () => {
    expect(routineSummary(2, 3)).toBe('산책 2회 · 배변 3회');
    expect(routineSummary(2, null)).toBe('산책 2회');
    expect(routineSummary(null, 3)).toBe('배변 3회');
    expect(routineSummary(0, null)).toBe('산책 0회');
    expect(routineSummary(null, null)).toBeNull();
  });

  it('값 글자·낭독·라벨', () => {
    expect(routineValueText(null)).toBe('안 적음');
    expect(routineValueText(0)).toBe('0회');
    expect(routineLiveText('walk', 3)).toBe('산책 3회');
    expect(routineLiveText('poop', null)).toBe('배변 안 적음');
    expect(routineButtonLabel('walk', 'minus')).toBe('산책 횟수 줄이기');
    expect(routineButtonLabel('poop', 'plus')).toBe('배변 횟수 늘리기');
    expect(routineButtonLabel('poop', 'clear')).toBe('배변 횟수 지우기');
    expect(routineToggleLabel('산책 2회', true)).toBe('산책·배변 기록 (선택), 산책 2회, 저장 전');
    expect(undoRoutineSentence(null)).toBe('');
  });

  it('금지 표현을 실제로 잡는다(기존 목록 + 루틴 추가 목록)', () => {
    for (const bad of [
      '하루 목표', '권장 횟수', '적정해요', '충분해요', '부족해요', '한 번 더 걸어요', '산책해야 해요', '산책하세요',
      '연속 3일', '3일째', '달성했어요', '좋아졌어요', '나빠졌어요', '변비', '설사', '정상이에요', '이상해요', '20% 늘었어요',
    ]) {
      expect({ bad, hit: findRoutineForbidden(bad) !== null }).toEqual({ bad, hit: true });
    }
  });
});
