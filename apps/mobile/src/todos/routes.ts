// 할 일 일정 화면의 경로와 화면 사이 안내 코드 (기획서 6-1)
// - 라우트: /todos(목록), /todos/new(추가), /todos/[id](보기·고치기). 모두 PetGate 안.
// - 화면 사이 안내는 파라미터 notice 에 고정 코드만 싣는다(제목 같은 자유 텍스트는 싣지 않는다). 문구는 todoText 에서 찾는다.
import { TODO_TEXT } from '../lib/todoText';

export const TODOS_HREF = '/todos';
export const NEW_TODO_HREF = '/todos/new';
export const todoHref = (id: string) => `/todos/${encodeURIComponent(id)}`;

export type TodoNoticeKind = 'created' | 'updated' | 'deleted' | 'gone';

export function isTodoNoticeKind(v: unknown): v is TodoNoticeKind {
  return v === 'created' || v === 'updated' || v === 'deleted' || v === 'gone';
}

export const TODO_NOTICE_TEXT: Record<TodoNoticeKind, string> = {
  created: TODO_TEXT.created,
  updated: TODO_TEXT.updated,
  deleted: TODO_TEXT.deleted,
  gone: TODO_TEXT.gone,
};
