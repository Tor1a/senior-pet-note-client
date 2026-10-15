import { describe, expect, it } from 'vitest';
import {
  isAtVisitQuestionLimit,
  isVisitQuestionUnchanged,
  normalizeVisitQuestionText,
  questionTexts,
  removeQuestion,
  replaceQuestion,
  toVisitQuestionInput,
  validateVisitQuestionText,
  visibleQuestions,
  visitQuestionLength,
  VISIT_QUESTION_MAX_COUNT,
} from './visitQuestionForm';
import { visitQuestionExample as ex } from './visitQuestionFixtures';

describe('입력 정규화·검증', () => {
  it('줄바꿈은 공백 한 칸으로 바꾸고 앞뒤 공백을 지운다. 그 밖의 가공은 하지 않는다', () => {
    expect(normalizeVisitQuestionText('  약 먹이는 법\n밤에 자주 깨요\r\n끝  ')).toBe('약 먹이는 법 밤에 자주 깨요 끝');
    expect(normalizeVisitQuestionText('이상해 보임 <b>그대로</b>')).toBe('이상해 보임 <b>그대로</b>');
    expect(toVisitQuestionInput(' 글\n ')).toEqual({ text: '글' });
  });

  it('비어 있거나 공백·줄바꿈뿐이면 empty', () => {
    for (const raw of ['', '   ', '\n', ' \r\n ']) expect(validateVisitQuestionText(raw)).toBe('empty');
  });

  it('100자는 통과, 101자는 tooLong(자르지 않는다). 이모지는 1자, 공백 제거 후 센다', () => {
    expect(validateVisitQuestionText('가'.repeat(100))).toBeNull();
    expect(validateVisitQuestionText('가'.repeat(101))).toBe('tooLong');
    expect(validateVisitQuestionText(`  ${'가'.repeat(100)}  `)).toBeNull();
    expect(validateVisitQuestionText('😀'.repeat(100))).toBeNull();
    expect(validateVisitQuestionText('😀'.repeat(101))).toBe('tooLong');
    expect(visitQuestionLength('😀😀')).toBe(2);
    // 입력 값 자체는 바뀌지 않는다
    const long = '가'.repeat(150);
    expect(toVisitQuestionInput(long).text).toBe(long);
  });

  it('고친 글이 저장된 글과 같으면 변경 없음', () => {
    expect(isVisitQuestionUnchanged('  글 ', '글')).toBe(true);
    expect(isVisitQuestionUnchanged('글2', '글')).toBe(false);
  });
});

describe('목록 나누기·한도', () => {
  const a = ex({ id: 'a', createdAt: '2026-10-15T01:00:00Z' });
  const b = ex({ id: 'b', createdAt: '2026-10-15T02:00:00Z' });
  const c = ex({ id: 'c', createdAt: '2026-10-15T03:00:00Z', completed: true, completedAt: '2026-10-15T05:00:00Z' });
  const d = ex({ id: 'd', createdAt: '2026-10-15T00:30:00Z', completed: true, completedAt: '2026-10-15T06:00:00Z' });

  it('남은 것은 등록 순, 물어본 것은 최근 완료가 위(서버 순서를 시각 문자열 비교로만 맞춘다)', () => {
    const all = [a, b, c, d];
    expect(visibleQuestions(all, 'open').map((q) => q.id)).toEqual(['a', 'b']);
    expect(visibleQuestions(all, 'done').map((q) => q.id)).toEqual(['d', 'c']);
  });

  it('접힌 줄은 남은 것에서 원래 등록 순 자리에 남는다', () => {
    const all = [a, b, c, d];
    expect(visibleQuestions(all, 'open', new Set(['d'])).map((q) => q.id)).toEqual(['d', 'a', 'b']);
    expect(visibleQuestions(all, 'open', ['c']).map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('같은 시각이면 받은 순서를 유지한다', () => {
    const s1 = ex({ id: 's1' });
    const s2 = ex({ id: 's2' });
    expect(visibleQuestions([s1, s2], 'open').map((q) => q.id)).toEqual(['s1', 's2']);
  });

  it('교체·삭제는 원본을 바꾸지 않는다', () => {
    const list = [a, b];
    expect(replaceQuestion(list, { ...a, text: '새 글' })[0].text).toBe('새 글');
    expect(removeQuestion(list, 'a').map((q) => q.id)).toEqual(['b']);
    expect(list).toHaveLength(2);
  });

  it('30개부터 한도. 목록을 모르면(null) 한도 아님', () => {
    const many = Array.from({ length: VISIT_QUESTION_MAX_COUNT }, (_, i) => ex({ id: `q${i}` }));
    expect(isAtVisitQuestionLimit(many)).toBe(true);
    expect(isAtVisitQuestionLimit(many.slice(1))).toBe(false);
    expect(isAtVisitQuestionLimit(null)).toBe(false);
  });

  it('리포트용 글 목록: 서버 순서 그대로, 응답이 비정상이면 빈 목록', () => {
    expect(questionTexts({ questions: [ex({ text: '둘째' , id: 'x'}), ex({ text: '첫째', id: 'y' })] })).toEqual(['둘째', '첫째']);
    expect(questionTexts(null)).toEqual([]);
    expect(questionTexts({ questions: null })).toEqual([]);
    expect(questionTexts({})).toEqual([]);
  });
});
