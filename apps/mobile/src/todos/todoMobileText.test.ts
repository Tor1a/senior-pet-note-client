import { findTodoForbidden } from '../lib/todoText';
import { isTodoNoticeKind, NEW_TODO_HREF, TODO_NOTICE_TEXT, TODOS_HREF, todoHref } from './routes';
import { TODO_MOBILE_TEXT } from './todoMobileText';

describe('모바일 전용 할 일 문구', () => {
  it('모든 문구가 금지 표현 검사를 통과한다', () => {
    for (const [key, value] of Object.entries(TODO_MOBILE_TEXT)) expect([key, findTodoForbidden(value)]).toEqual([key, null]);
    for (const [key, value] of Object.entries(TODO_NOTICE_TEXT)) expect([key, findTodoForbidden(value)]).toEqual([key, null]);
  });
});

describe('할 일 경로와 안내 코드', () => {
  it('경로', () => {
    expect(TODOS_HREF).toBe('/todos');
    expect(NEW_TODO_HREF).toBe('/todos/new');
    expect(todoHref('a b/1')).toBe('/todos/a%20b%2F1');
  });
  it('안내 코드는 고정 4개만 받는다', () => {
    for (const k of ['created', 'updated', 'deleted', 'gone']) expect(isTodoNoticeKind(k)).toBe(true);
    for (const k of ['petCreated', '', undefined, '제목']) expect(isTodoNoticeKind(k)).toBe(false);
  });
});
