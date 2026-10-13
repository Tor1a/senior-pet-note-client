import { describe, expect, it } from 'vitest';
import {
  codePointLength,
  draftFromTodo,
  EMPTY_TODO_DRAFT,
  isCalendarDate,
  isTodoDraftDirty,
  TODO_FORM_MESSAGES,
  toTodoInput,
  validateTodoDraft,
  type TodoDraft,
} from './todoForm';
import { todoExample } from './todoFixtures';
import { findTodoForbidden } from './todoText';

const ok = (over: Partial<TodoDraft> = {}): TodoDraft => ({ ...EMPTY_TODO_DRAFT, title: '접종', dueDate: '2026-10-20', ...over });

describe('todoForm — 검증', () => {
  it('새 할 일 기본값: 날짜·시각은 비어 있고 알림은 켜져 있다', () => {
    expect(EMPTY_TODO_DRAFT).toMatchObject({ title: '', dueDate: '', dueTime: '', remind: true, id: null });
  });
  it('제목: 비었거나 공백만이면 오류, 40자는 통과, 41자는 오류(코드 포인트 기준)', () => {
    expect(validateTodoDraft(ok({ title: '   ' }))).toEqual({ field: 'title', message: TODO_FORM_MESSAGES.titleEmpty });
    expect(validateTodoDraft(ok({ title: '가'.repeat(40) }))).toBeNull();
    expect(validateTodoDraft(ok({ title: '가'.repeat(41) }))?.message).toBe(TODO_FORM_MESSAGES.titleLong);
    // 이모지는 UTF-16 으로 2칸이지만 1자로 센다
    expect(validateTodoDraft(ok({ title: '🐶'.repeat(40) }))).toBeNull();
    expect(validateTodoDraft(ok({ title: ` ${'가'.repeat(40)} ` }))).toBeNull();
    expect(codePointLength('🐶a')).toBe(2);
  });
  it('날짜: 필수, 달력에 없는 날은 오류', () => {
    expect(validateTodoDraft(ok({ dueDate: '' }))).toEqual({ field: 'dueDate', message: TODO_FORM_MESSAGES.dateEmpty });
    expect(validateTodoDraft(ok({ dueDate: '2026-02-30' }))?.field).toBe('dueDate');
    expect(validateTodoDraft(ok({ dueDate: '2026-2-3' }))?.field).toBe('dueDate');
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2027-02-29')).toBe(false);
  });
  it('날짜에 오늘과의 비교는 하지 않는다: 아주 먼 과거·미래도 1차 검증은 통과(서버가 400)', () => {
    expect(validateTodoDraft(ok({ dueDate: '1999-01-01' }))).toBeNull();
    expect(validateTodoDraft(ok({ dueDate: '2099-12-31' }))).toBeNull();
  });
  it('시각: 비어 있으면 통과, HH:mm 형식만', () => {
    expect(validateTodoDraft(ok({ dueTime: '' }))).toBeNull();
    expect(validateTodoDraft(ok({ dueTime: '23:59' }))).toBeNull();
    expect(validateTodoDraft(ok({ dueTime: '24:00' }))?.field).toBe('dueTime');
    expect(validateTodoDraft(ok({ dueTime: '9:00' }))?.field).toBe('dueTime');
  });
  it('일정 메모 200자, 병원 메모 500자 경계', () => {
    expect(validateTodoDraft(ok({ memo: 'a'.repeat(200) }))).toBeNull();
    expect(validateTodoDraft(ok({ memo: 'a'.repeat(201) }))).toEqual({ field: 'memo', message: TODO_FORM_MESSAGES.memoLong });
    expect(validateTodoDraft(ok({ hospitalNote: 'a'.repeat(500) }))).toBeNull();
    expect(validateTodoDraft(ok({ hospitalNote: 'a'.repeat(501) }))).toEqual({
      field: 'hospitalNote',
      message: TODO_FORM_MESSAGES.hospitalNoteLong,
    });
  });
  it('여러 문제가 있으면 화면 순서대로 첫 문제를 돌려준다', () => {
    expect(validateTodoDraft(ok({ title: '', dueDate: '' }))?.field).toBe('title');
    expect(validateTodoDraft(ok({ dueDate: '', memo: 'a'.repeat(201) }))?.field).toBe('dueDate');
  });
  it('오류 문구에 금지 표현이 없다', () => {
    for (const m of Object.values(TODO_FORM_MESSAGES)) expect(findTodoForbidden(m)).toBeNull();
  });
});

describe('todoForm — 본문 변환·복원·변경 여부', () => {
  it('빈 값은 null, 앞뒤 공백은 제거, remind 는 그대로', () => {
    expect(toTodoInput(ok({ title: '  접종  ', memo: '  ', hospitalNote: '', dueTime: '', remind: false }))).toEqual({
      title: '접종',
      dueDate: '2026-10-20',
      dueTime: null,
      memo: null,
      hospitalNote: null,
      remind: false,
    });
    expect(toTodoInput(ok({ dueTime: '15:00', memo: ' 수첩 ', hospitalNote: '다음 달 재방문' }))).toMatchObject({
      dueTime: '15:00',
      memo: '수첩',
      hospitalNote: '다음 달 재방문',
      remind: true,
    });
  });
  it('응답 → 폼 복원 → 본문 변환이 왕복한다', () => {
    const todo = todoExample({ hospitalNote: '기록', dueTime: null, memo: null, remind: false });
    const draft = draftFromTodo(todo);
    expect(draft).toMatchObject({ id: 'todo-1', dueTime: '', memo: '', hospitalNote: '기록', remind: false });
    expect(toTodoInput(draft)).toEqual({
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: null,
      memo: null,
      hospitalNote: '기록',
      remind: false,
    });
  });
  it('변경 여부: 같은 값·공백만 다른 값은 변경 아님, 각 칸이 바뀌면 변경', () => {
    const base = draftFromTodo(todoExample());
    expect(isTodoDraftDirty(base, base)).toBe(false);
    expect(isTodoDraftDirty({ ...base, title: ` ${base.title} ` }, base)).toBe(false);
    for (const patch of [
      { title: '다른 제목' },
      { dueDate: '2026-10-21' },
      { dueTime: '' },
      { memo: '바꿈' },
      { hospitalNote: '새 메모' },
      { remind: false },
    ]) {
      expect(isTodoDraftDirty({ ...base, ...patch }, base)).toBe(true);
    }
  });
});
