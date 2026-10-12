// [공유 로직 테스트 사본] 원본: web/src/lib/undoText.test.ts (2026-10-12 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import {
  doseUndoFailText,
  doseUndoButtonLabel,
  doseUndoneText,
  findUndoForbidden,
  UNDO_TEXT,
  weightCardSpeech,
  weightEnteredText,
  weightLastText,
} from './undoText';

describe('되돌리기·실수 방지 문구', () => {
  it('금지 표현(의료 판단·평가·증감·퍼센트·비교)을 쓰지 않는다', () => {
    const texts = [
      ...Object.values(UNDO_TEXT),
      doseUndoneText('아조딜'),
      doseUndoFailText('서버에 잠시 문제가 있어요.'),
      doseUndoButtonLabel('아조딜 1캡슐', '오전 8:00'),
      weightLastText('4.3', '3일 전'),
      weightEnteredText('43'),
      weightCardSpeech('4.3', '43'),
    ];
    for (const text of texts) expect({ text, hit: findUndoForbidden(text) }).toEqual({ text, hit: null });
  });

  it('검사 함수가 기존 금지어와 증감 표현을 모두 잡는다', () => {
    for (const bad of ['이상해요', '체중이 늘었어요', '10% 많아요', '증가', '5배 많아요', '차이가 커요', '변화가 있어요', '실수했어요']) {
      expect({ bad, hit: findUndoForbidden(bad) === null }).toEqual({ bad, hit: false });
    }
    expect(findUndoForbidden('지난 기록 4.3kg (3일 전)')).toBeNull();
  });

  it('체중 카드는 숫자만 나란히 보여 주고 판단 말이 없다', () => {
    const all = [UNDO_TEXT.weightTitle, UNDO_TEXT.weightBody1, UNDO_TEXT.weightBody2, UNDO_TEXT.weightBarHint].join(' ');
    for (const word of ['%', '배', '늘', '줄', '차이', '병원']) expect(all.includes(word)).toBe(false);
  });
});
